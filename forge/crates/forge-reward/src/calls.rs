use crate::ast::{Expr, ExprKind, Generator};
use crate::check::{check_name, Compiler, Scope};
use crate::ir::{Elementwise, Node, Pairwise, Reduction, Type};
use crate::parser::fail;
use crate::typing::{broadcast, numeric, Typed};

fn elementwise(name: &str) -> Option<Elementwise> {
    Some(match name {
        "exp" => Elementwise::Exp,
        "log" => Elementwise::Log,
        "sqrt" => Elementwise::Sqrt,
        "abs" => Elementwise::Abs,
        "tanh" => Elementwise::Tanh,
        "sin" => Elementwise::Sin,
        "cos" => Elementwise::Cos,
        "square" => Elementwise::Square,
        _ => return None,
    })
}

fn reduction(name: &str) -> Option<Reduction> {
    Some(match name {
        "sum" => Reduction::Sum,
        "mean" => Reduction::Mean,
        "min" => Reduction::Min,
        "max" => Reduction::Max,
        "norm" => Reduction::Norm,
        _ => return None,
    })
}

fn arity(name: &str, args: &[Expr], wanted: usize, line: usize) -> Result<(), String> {
    if args.len() != wanted {
        return fail(line, &format!("{name} takes {wanted} arguments"));
    }

    Ok(())
}

impl Compiler<'_> {
    fn numeric_arg(&mut self, scope: &mut Scope, arg: &Expr) -> Result<Typed, String> {
        let (node, kind) = self.expr(scope, arg)?;

        if !numeric(kind) {
            return fail(arg.line, "Expected a number or a vector");
        }

        Ok((node, kind))
    }

    fn term(&mut self, scope: &mut Scope, args: &[Expr], line: usize) -> Result<Typed, String> {
        arity("term", args, 2, line)?;

        let ExprKind::Text(name) = &args[0].kind else {
            return fail(line, "term needs a name in quotes first");
        };

        if !scope.is_entry || scope.generators > 0 {
            return fail(line, "term belongs directly in reward, outside loops and helpers");
        }

        if self.terms.contains(name) {
            return fail(line, &format!("The term {name} is named twice"));
        }

        let (value, kind) = self.expr(scope, &args[1])?;

        if kind != Type::Scalar {
            return fail(line, "A term must be a single number");
        }

        self.terms.push(name.clone());

        Ok((Node::Term(self.terms.len() - 1, Box::new(value)), Type::Scalar))
    }

    fn gather(
        &mut self,
        scope: &mut Scope,
        kind: Reduction,
        generator: &Generator,
        line: usize,
    ) -> Result<Typed, String> {
        check_name(&generator.variable, line)?;

        let (source, source_kind) = self.expr(scope, &generator.source)?;

        if source_kind != Type::Bodies || !matches!(source, Node::Bodies) {
            return fail(line, "Loops may only go over state.bodies");
        }

        if kind == Reduction::Norm {
            return fail(line, "norm takes a vector");
        }

        let slot = scope.bind(&generator.variable, Type::Body);

        scope.generators += 1;

        let element = self.expr(scope, &generator.element);

        scope.generators -= 1;
        scope.names.retain(|(_, s, _)| *s != slot);

        let (element, element_kind) = element?;

        if element_kind != Type::Scalar {
            return fail(line, "Each body must give one number");
        }

        Ok((Node::Gather(kind, slot, Box::new(element)), Type::Scalar))
    }

    fn reduce(&mut self, scope: &mut Scope, kind: Reduction, args: &[Expr], line: usize) -> Result<Typed, String> {
        if let [Expr {
            kind: ExprKind::Generate(generator),
            ..
        }] = args
        {
            return self.gather(scope, kind, generator, line);
        }

        let (node, arg_kind) = self.numeric_arg(scope, &args[0])?;

        if !matches!(arg_kind, Type::Vector(_)) {
            return fail(line, "Reductions take a vector or a loop over state.bodies");
        }

        Ok((Node::Reduce(kind, Box::new(node)), Type::Scalar))
    }

    fn pair(&mut self, scope: &mut Scope, kind: Pairwise, args: &[Expr], line: usize) -> Result<Typed, String> {
        let (a, a_kind) = self.numeric_arg(scope, &args[0])?;
        let (b, b_kind) = self.numeric_arg(scope, &args[1])?;
        let out = broadcast(a_kind, b_kind, line)?;

        Ok((Node::Pair(kind, Box::new(a), Box::new(b)), out))
    }

    fn clamp(&mut self, scope: &mut Scope, args: &[Expr], line: usize) -> Result<Typed, String> {
        arity("clamp", args, 3, line)?;

        let (x, kind) = self.numeric_arg(scope, &args[0])?;
        let (low, low_kind) = self.numeric_arg(scope, &args[1])?;
        let (high, high_kind) = self.numeric_arg(scope, &args[2])?;
        let out = broadcast(broadcast(kind, low_kind, line)?, high_kind, line)?;

        Ok((Node::Clamp(Box::new(x), Box::new(low), Box::new(high)), out))
    }

    fn user_call(&mut self, scope: &mut Scope, name: &str, args: &[Expr], line: usize) -> Result<Typed, String> {
        let Some(target) = self.sources.iter().position(|f| f.name == name) else {
            return fail(line, &format!("Unknown function {name}"));
        };

        if target >= scope.source {
            return fail(
                line,
                &format!("{name} must be defined above the function that calls it"),
            );
        }

        arity(name, args, self.sources[target].params.len(), line)?;

        let typed: Result<Vec<Typed>, String> = args.iter().map(|a| self.expr(scope, a)).collect();
        let (nodes, kinds): (Vec<Node>, Vec<Type>) = typed?.into_iter().unzip();
        let (index, kind) = self.function(target, &kinds)?;

        Ok((Node::Call(index, nodes), kind))
    }

    pub(crate) fn call(&mut self, scope: &mut Scope, name: &str, args: &[Expr], line: usize) -> Result<Typed, String> {
        check_name(name, line)?;

        if let Some(kind) = elementwise(name) {
            arity(name, args, 1, line)?;

            let (node, arg_kind) = self.numeric_arg(scope, &args[0])?;

            return Ok((Node::Apply(kind, Box::new(node)), arg_kind));
        }

        match (name, args.len()) {
            ("term", _) => self.term(scope, args, line),
            ("min", 2) => self.pair(scope, Pairwise::Min, args, line),
            ("max", 2) => self.pair(scope, Pairwise::Max, args, line),
            ("safe_div", 2) => self.pair(scope, Pairwise::SafeDiv, args, line),
            ("clamp", _) => self.clamp(scope, args, line),
            ("dot", 2) => {
                let (a, a_kind) = self.numeric_arg(scope, &args[0])?;
                let (b, b_kind) = self.numeric_arg(scope, &args[1])?;

                if !matches!(broadcast(a_kind, b_kind, line)?, Type::Vector(_)) || a_kind != b_kind {
                    return fail(line, "dot takes two vectors of the same length");
                }

                Ok((Node::Dot(Box::new(a), Box::new(b)), Type::Scalar))
            }
            (_, 1) if reduction(name).is_some() => self.reduce(scope, reduction(name).expect("checked"), args, line),
            ("min" | "max" | "safe_div" | "dot" | "sum" | "mean" | "norm", _) => {
                fail(line, &format!("{name} got the wrong number of arguments"))
            }
            _ => self.user_call(scope, name, args, line),
        }
    }
}
