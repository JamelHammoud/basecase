use crate::ast::{Function, Stmt};
use crate::ir::{CompiledFunction, Node, Type};
use crate::parser::{fail, parse};

pub const BUILTINS: [&str; 19] = [
    "exp", "log", "sqrt", "abs", "tanh", "sin", "cos", "square", "min", "max", "safe_div", "clamp", "sum", "mean",
    "norm", "dot", "term", "True", "False",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Schema {
    pub joints: usize,
    pub bodies: usize,
}

#[derive(Clone, Debug)]
pub struct Program {
    pub(crate) functions: Vec<CompiledFunction>,
    pub(crate) entry: usize,
    pub terms: Vec<String>,
    pub schema: Schema,
    pub reference: bool,
}

pub(crate) struct Scope {
    pub names: Vec<(String, usize, Type)>,
    pub slots: usize,
    pub source: usize,
    pub is_entry: bool,
    pub generators: usize,
}

impl Scope {
    pub fn bind(&mut self, name: &str, kind: Type) -> usize {
        let slot = self.slots;

        self.slots += 1;
        self.names.push((name.to_owned(), slot, kind));

        slot
    }

    pub fn lookup(&self, name: &str) -> Option<(usize, Type)> {
        self.names
            .iter()
            .rev()
            .find(|(n, _, _)| n == name)
            .map(|(_, slot, kind)| (*slot, *kind))
    }
}

pub(crate) struct Compiler<'a> {
    pub schema: Schema,
    pub reference: bool,
    pub sources: &'a [Function],
    pub compiled: Vec<CompiledFunction>,
    pub signatures: Vec<(usize, Vec<Type>, usize, Type)>,
    pub terms: Vec<String>,
}

pub fn check_name(name: &str, line: usize) -> Result<(), String> {
    if name.starts_with("__") {
        return fail(line, "Names starting with __ aren't allowed");
    }

    Ok(())
}

impl Compiler<'_> {
    fn assign(
        &mut self,
        scope: &mut Scope,
        name: &str,
        value: &crate::ast::Expr,
        line: usize,
    ) -> Result<(usize, Node), String> {
        check_name(name, line)?;

        if BUILTINS.contains(&name) || self.sources.iter().any(|f| f.name == name) {
            return fail(
                line,
                &format!("{name} is a built-in or function name and can't be assigned"),
            );
        }

        let (node, kind) = self.expr(scope, value)?;

        if matches!(kind, Type::State | Type::Bodies | Type::Body) {
            return fail(line, "State can't be copied into a name");
        }

        Ok((scope.bind(name, kind), node))
    }

    pub fn function(&mut self, source: usize, args: &[Type]) -> Result<(usize, Type), String> {
        let cached = self.signatures.iter().find(|(s, a, _, _)| *s == source && a == args);

        if let Some((_, _, index, kind)) = cached {
            return Ok((*index, *kind));
        }

        let function = &self.sources[source];
        let is_entry = function.name == "reward";
        let mut scope = Scope {
            names: Vec::new(),
            slots: 0,
            source,
            is_entry,
            generators: 0,
        };
        let mut assignments = Vec::new();

        for (param, kind) in function.params.iter().zip(args) {
            check_name(param, function.line)?;
            scope.bind(param, *kind);
        }

        for (position, stmt) in function.body.iter().enumerate() {
            match stmt {
                Stmt::Assign { name, value, line } => assignments.push(self.assign(&mut scope, name, value, *line)?),
                Stmt::Return { value, line } => {
                    if position + 1 != function.body.len() {
                        return fail(*line, "Nothing may follow return");
                    }

                    let (result, kind) = self.expr(&mut scope, value)?;
                    let compiled = CompiledFunction {
                        slots: scope.slots,
                        assignments,
                        result,
                    };

                    self.compiled.push(compiled);
                    self.signatures
                        .push((source, args.to_vec(), self.compiled.len() - 1, kind));

                    return Ok((self.compiled.len() - 1, kind));
                }
            }
        }

        fail(function.line, &format!("{} must end with return", function.name))
    }
}

fn check_duplicates(functions: &[Function]) -> Result<(), String> {
    for (index, function) in functions.iter().enumerate() {
        check_name(&function.name, function.line)?;

        if BUILTINS.contains(&function.name.as_str()) {
            return fail(function.line, &format!("{} is a built-in name", function.name));
        }

        if functions[..index].iter().any(|f| f.name == function.name) {
            return fail(function.line, &format!("{} is defined twice", function.name));
        }
    }

    Ok(())
}

pub fn compile(source: &str, schema: Schema) -> Result<Program, String> {
    compile_for(source, schema, false)
}

pub fn compile_for(source: &str, schema: Schema, reference: bool) -> Result<Program, String> {
    let functions = parse(source)?;

    check_duplicates(&functions)?;

    let entry = functions
        .iter()
        .position(|f| f.name == "reward")
        .ok_or("The program needs def reward(state):")?;

    if functions[entry].params.len() != 1 {
        return fail(functions[entry].line, "reward takes exactly one argument, the state");
    }

    let mut compiler = Compiler {
        schema,
        reference,
        sources: &functions,
        compiled: Vec::new(),
        signatures: Vec::new(),
        terms: Vec::new(),
    };
    let (index, kind) = compiler.function(entry, &[Type::State])?;

    if kind != Type::Scalar {
        return fail(functions[entry].line, "reward must return a number");
    }

    Ok(Program {
        functions: compiler.compiled,
        entry: index,
        terms: compiler.terms,
        schema,
        reference,
    })
}
