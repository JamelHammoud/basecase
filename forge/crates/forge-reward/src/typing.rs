use crate::ast::{BinaryOp, Expr, ExprKind};
use crate::check::{check_name, Compiler, Scope, BUILTINS};
use crate::ir::{BodyField, Node, StateField, Type};
use crate::parser::fail;

const MAX_POWER: f64 = 8.0;

pub(crate) type Typed = (Node, Type);

fn state_field(name: &str, joints: usize) -> Option<(Node, Type)> {
    let (field, kind) = match name {
        "gravity" => (StateField::Gravity, Type::Vector(3)),
        "angvel" => (StateField::AngVel, Type::Vector(3)),
        "linvel" => (StateField::LinVel, Type::Vector(3)),
        "command" => (StateField::Command, Type::Vector(3)),
        "z" => (StateField::Z, Type::Scalar),
        "z0" => (StateField::Z0, Type::Scalar),
        "control_dt" => (StateField::ControlDt, Type::Scalar),
        "joint_pos" => (StateField::JointPos, Type::Vector(joints)),
        "joint_vel" => (StateField::JointVel, Type::Vector(joints)),
        "action" => (StateField::Action, Type::Vector(joints)),
        "last_action" => (StateField::LastAction, Type::Vector(joints)),
        "bodies" => return Some((Node::Bodies, Type::Bodies)),
        _ => return None,
    };

    Some((Node::Field(field), kind))
}

fn body_field(slot: usize, name: &str) -> Option<(Node, Type)> {
    match name {
        "pos" => Some((Node::Body(slot, BodyField::Pos), Type::Vector(3))),
        "vel" => Some((Node::Body(slot, BodyField::Vel), Type::Vector(3))),
        "z" => Some((Node::Body(slot, BodyField::Z), Type::Scalar)),
        _ => None,
    }
}

pub(crate) fn constant(expr: &Expr) -> Option<f64> {
    match &expr.kind {
        ExprKind::Number(v) => Some(*v),
        ExprKind::Negate(inner) => constant(inner).map(|v| -v),
        _ => None,
    }
}

fn positive(expr: &Expr) -> bool {
    match &expr.kind {
        ExprKind::Number(v) => *v > 0.0,
        ExprKind::Binary(BinaryOp::Mul | BinaryOp::Add, a, b) => positive(a) && positive(b),
        ExprKind::Call(name, args) if name == "max" => args.iter().any(positive),
        ExprKind::Call(name, args) if name == "min" => args.len() > 1 && args.iter().all(positive),
        ExprKind::Call(name, _) => name == "exp",
        _ => false,
    }
}

fn nonzero(expr: &Expr) -> bool {
    constant(expr).is_some_and(|d| d != 0.0) || positive(expr)
}

pub(crate) fn numeric(kind: Type) -> bool {
    matches!(kind, Type::Scalar | Type::Vector(_))
}

pub(crate) fn broadcast(a: Type, b: Type, line: usize) -> Result<Type, String> {
    match (a, b) {
        (Type::Scalar, Type::Scalar) => Ok(Type::Scalar),
        (Type::Vector(n), Type::Scalar) | (Type::Scalar, Type::Vector(n)) => Ok(Type::Vector(n)),
        (Type::Vector(n), Type::Vector(m)) if n == m => Ok(Type::Vector(n)),
        (Type::Vector(n), Type::Vector(m)) => fail(line, &format!("Vectors of length {n} and {m} don't match")),
        _ => fail(line, "Arithmetic needs numbers or vectors"),
    }
}

fn whole(value: f64, line: usize) -> Result<i64, String> {
    if value.fract() != 0.0 {
        return fail(line, "Indexes must be whole numbers");
    }

    Ok(value as i64)
}

fn position(value: i64, len: usize, line: usize) -> Result<usize, String> {
    let resolved = if value < 0 { len as i64 + value } else { value };

    if resolved < 0 || resolved as usize >= len {
        return fail(line, &format!("Index {value} is outside a vector of length {len}"));
    }

    Ok(resolved as usize)
}

fn bound(expr: &Option<Box<Expr>>, fallback: usize, len: usize, line: usize) -> Result<usize, String> {
    let Some(e) = expr else { return Ok(fallback) };
    let value = constant(e).ok_or_else(|| format!("Line {line}: Slice bounds must be numbers"))?;
    let index = whole(value, line)?;
    let resolved = if index < 0 { len as i64 + index } else { index };

    Ok(resolved.clamp(0, len as i64) as usize)
}

impl Compiler<'_> {
    fn name(&mut self, scope: &Scope, name: &str, line: usize) -> Result<Typed, String> {
        check_name(name, line)?;

        if let Some((slot, kind)) = scope.lookup(name) {
            let node = if kind == Type::State {
                Node::State
            } else {
                Node::Local(slot)
            };

            return Ok((node, kind));
        }

        match name {
            "True" => Ok((Node::Truth(true), Type::Bool)),
            "False" => Ok((Node::Truth(false), Type::Bool)),
            _ if BUILTINS.contains(&name) => fail(line, &format!("{name} is a function; call it")),
            _ => fail(line, &format!("Unknown name {name}")),
        }
    }

    fn attribute(&mut self, scope: &mut Scope, target: &Expr, field: &str, line: usize) -> Result<Typed, String> {
        check_name(field, line)?;

        let (node, kind) = self.expr(scope, target)?;
        let found = match (kind, &node) {
            (Type::State, _) => state_field(field, self.schema.joints),
            (Type::Body, Node::Local(slot)) => body_field(*slot, field),
            _ => None,
        };

        found.ok_or_else(|| format!("Line {line}: state has no field {field}"))
    }

    fn index(&mut self, scope: &mut Scope, target: &Expr, at: &Expr, line: usize) -> Result<Typed, String> {
        let (node, kind) = self.expr(scope, target)?;
        let Type::Vector(len) = kind else {
            return fail(line, "Only vectors can be indexed");
        };
        let value = constant(at).ok_or_else(|| format!("Line {line}: Indexes must be numbers"))?;
        let at = position(whole(value, line)?, len, line)?;

        Ok((Node::Index(Box::new(node), at), Type::Scalar))
    }

    fn slice(
        &mut self,
        scope: &mut Scope,
        target: &Expr,
        ends: [&Option<Box<Expr>>; 2],
        line: usize,
    ) -> Result<Typed, String> {
        let (node, kind) = self.expr(scope, target)?;
        let Type::Vector(len) = kind else {
            return fail(line, "Only vectors can be sliced");
        };
        let from = bound(ends[0], 0, len, line)?;
        let to = bound(ends[1], len, len, line)?;

        if to <= from {
            return fail(line, "A slice must keep at least one element");
        }

        Ok((Node::Slice(Box::new(node), from, to), Type::Vector(to - from)))
    }

    fn binary(&mut self, scope: &mut Scope, op: BinaryOp, sides: [&Expr; 2], line: usize) -> Result<Typed, String> {
        let (left, left_kind) = self.expr(scope, sides[0])?;

        if op == BinaryOp::Pow {
            let power = constant(sides[1]).filter(|p| p.fract() == 0.0 && (0.0..=MAX_POWER).contains(p));
            let power = power.ok_or_else(|| format!("Line {line}: Powers must be whole numbers from 0 to 8"))?;

            broadcast(left_kind, Type::Scalar, line)?;

            return Ok((Node::Power(Box::new(left), power as i32), left_kind));
        }

        if op == BinaryOp::Div && !nonzero(sides[1]) {
            return fail(
                line,
                "Divide only by a nonzero number or a provably positive value; use safe_div(a, b)",
            );
        }

        let (right, right_kind) = self.expr(scope, sides[1])?;
        let kind = broadcast(left_kind, right_kind, line)?;

        Ok((Node::Binary(op, Box::new(left), Box::new(right)), kind))
    }

    fn logic_operand(&mut self, scope: &mut Scope, expr: &Expr) -> Result<Node, String> {
        let (node, kind) = self.expr(scope, expr)?;

        if kind != Type::Bool {
            return fail(expr.line, "and, or, not and conditions need true or false values");
        }

        Ok(node)
    }

    fn choose(&mut self, scope: &mut Scope, parts: [&Expr; 3], line: usize) -> Result<Typed, String> {
        let condition = self.logic_operand(scope, parts[0])?;
        let (yes, yes_kind) = self.expr(scope, parts[1])?;
        let (no, no_kind) = self.expr(scope, parts[2])?;

        if yes_kind != no_kind || !matches!(yes_kind, Type::Scalar | Type::Vector(_) | Type::Bool) {
            return fail(line, "Both branches of a conditional need the same kind of value");
        }

        Ok((Node::Choose(Box::new(condition), Box::new(yes), Box::new(no)), yes_kind))
    }

    pub(crate) fn expr(&mut self, scope: &mut Scope, expr: &Expr) -> Result<Typed, String> {
        let line = expr.line;

        match &expr.kind {
            ExprKind::Number(v) => Ok((Node::Number(*v), Type::Scalar)),
            ExprKind::Text(_) => fail(line, "Text is only for term names"),
            ExprKind::Name(name) => self.name(scope, name, line),
            ExprKind::Attribute(target, field) => self.attribute(scope, target, field, line),
            ExprKind::Index(target, at) => self.index(scope, target, at, line),
            ExprKind::Slice(target, from, to) => self.slice(scope, target, [from, to], line),
            ExprKind::Negate(inner) => {
                let (node, kind) = self.expr(scope, inner)?;

                broadcast(kind, Type::Scalar, line)?;

                Ok((Node::Negate(Box::new(node)), kind))
            }
            ExprKind::Not(inner) => Ok((Node::Not(Box::new(self.logic_operand(scope, inner)?)), Type::Bool)),
            ExprKind::Binary(op, left, right) => self.binary(scope, *op, [left, right], line),
            ExprKind::Compare(op, left, right) => {
                let (a, a_kind) = self.expr(scope, left)?;
                let (b, b_kind) = self.expr(scope, right)?;

                if a_kind != Type::Scalar || b_kind != Type::Scalar {
                    return fail(line, "Comparisons need two numbers");
                }

                Ok((Node::Compare(*op, Box::new(a), Box::new(b)), Type::Bool))
            }
            ExprKind::Logic(op, left, right) => {
                let a = self.logic_operand(scope, left)?;
                let b = self.logic_operand(scope, right)?;

                Ok((Node::Logic(*op, Box::new(a), Box::new(b)), Type::Bool))
            }
            ExprKind::Choose(condition, yes, no) => self.choose(scope, [condition, yes, no], line),
            ExprKind::Call(name, args) => self.call(scope, name, args, line),
            ExprKind::Generate(_) => fail(line, "Iterate over bodies inside sum, mean, min or max"),
        }
    }
}
