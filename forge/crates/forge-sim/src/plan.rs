use crate::params::{impedance, solref_safe, Imp, MIN_VAL};
use crate::sparse::Pattern;
use forge_ir::{Kernel, Pair};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RowKind {
    Friction,
    Limit,
    Contact,
}

#[derive(Clone, Debug)]
pub struct FrictionRow {
    pub dof: usize,
    pub loss: f64,
    pub r: f64,
    pub b: f64,
}

#[derive(Clone, Debug)]
pub struct LimitRow {
    pub qposadr: usize,
    pub dof: usize,
    pub sign: f64,
    pub bound: f64,
    pub margin: f64,
    pub diag: f64,
    pub imp: Imp,
}

#[derive(Clone, Debug)]
pub struct ContactSlot {
    pub pair: usize,
    pub index: usize,
    pub chain: usize,
    pub rows: usize,
    pub row: usize,
    pub diag: f64,
    pub imp: Imp,
    pub mu: f64,
    pub frictions: [f64; 2],
    pub include_margin: f64,
}

#[derive(Clone, Debug)]
pub struct ChainTerm {
    pub dof: usize,
    pub sign: f64,
    pub root: usize,
}

#[derive(Clone, Debug)]
pub struct Chain {
    pub dofs: Vec<usize>,
    pub terms: Vec<Vec<ChainTerm>>,
    pub hessian: Vec<usize>,
}

pub struct Plan {
    pub kernel: Kernel,
    pub nbody: usize,
    pub m_adr: Vec<usize>,
    pub m_nnz: Vec<usize>,
    pub m_col: Vec<usize>,
    pub nm: usize,
    pub friction: Vec<FrictionRow>,
    pub limits: Vec<LimitRow>,
    pub contacts: Vec<ContactSlot>,
    pub chains: Vec<Chain>,
    pub nrows: usize,
    pub row_kind: Vec<RowKind>,
    pub row_chain: Vec<usize>,
    pub row_jadr: Vec<usize>,
    pub row_len: Vec<usize>,
    pub jcol: Vec<usize>,
    pub njac: usize,
    pub pattern: Pattern,
}

fn matrix_pattern(k: &Kernel) -> (Vec<usize>, Vec<usize>, Vec<usize>) {
    let mut adr = Vec::with_capacity(k.nv);
    let mut nnz = Vec::with_capacity(k.nv);
    let mut col = Vec::new();

    for i in 0..k.nv {
        let row = k.ancestors(i);

        adr.push(col.len());
        nnz.push(row.len());
        col.extend(row);
    }

    (adr, nnz, col)
}

fn friction_rows(k: &Kernel) -> Vec<FrictionRow> {
    let dt = k.options.timestep;

    k.dofs
        .iter()
        .enumerate()
        .filter_map(|(dof, d)| {
            let f = d.friction.as_ref()?;
            let solref = solref_safe(f.solref, dt, k.options.refsafe);
            let imp = Imp::new(f.solimp, solref);
            let (value, _) = impedance(&imp.solimp, 0.0, 0.0);

            Some(FrictionRow {
                dof,
                loss: f.loss,
                r: ((1.0 - value) * d.invweight / value).max(MIN_VAL),
                b: imp.b,
            })
        })
        .collect()
}

fn limit_rows(k: &Kernel) -> Vec<LimitRow> {
    let dt = k.options.timestep;
    let mut out = Vec::new();

    for j in &k.joints {
        let Some(limit) = &j.limit else { continue };
        let solref = solref_safe(limit.solref, dt, k.options.refsafe);

        for (side, bound) in [(-1.0, limit.range[0]), (1.0, limit.range[1])] {
            out.push(LimitRow {
                qposadr: j.qposadr,
                dof: j.dofadr,
                sign: side,
                bound,
                margin: limit.margin,
                diag: k.dofs[j.dofadr].invweight,
                imp: Imp::new(limit.solimp, solref),
            });
        }
    }

    out
}

fn pair_chain(k: &Kernel, pair: &Pair) -> Chain {
    let bodies = pair.geoms.map(|g| k.geoms[g].body);
    let chains = bodies.map(|b| k.body_chain(b));
    let mut dofs: Vec<usize> = chains[0]
        .iter()
        .chain(chains[1].iter())
        .copied()
        .filter(|d| !(chains[0].contains(d) && chains[1].contains(d)))
        .collect();

    dofs.sort_unstable();
    dofs.dedup();

    let terms = dofs
        .iter()
        .map(|&d| {
            (0..2)
                .filter(|&s| chains[s].contains(&d))
                .map(|s| ChainTerm {
                    dof: d,
                    sign: if s == 1 { 1.0 } else { -1.0 },
                    root: k.bodies[bodies[s]].root,
                })
                .collect()
        })
        .collect();

    Chain {
        dofs,
        terms,
        hessian: Vec::new(),
    }
}

fn hessian_index(adr: &[usize], nnz: &[usize], col: &[usize], dofs: &[usize]) -> Vec<usize> {
    let mut out = Vec::with_capacity(dofs.len() * (dofs.len() + 1) / 2);

    for (a, &i) in dofs.iter().enumerate() {
        let row = &col[adr[i]..adr[i] + nnz[i]];

        for &j in &dofs[..=a] {
            let at = row
                .iter()
                .position(|&c| c == j)
                .expect("contact chains follow one branch of the tree");

            out.push(adr[i] + at);
        }
    }

    out
}

fn contact_slots(k: &Kernel, chains: &mut Vec<Chain>, first_row: usize) -> Vec<ContactSlot> {
    let dt = k.options.timestep;
    let mut out = Vec::new();
    let mut row = first_row;

    for (p, pair) in k.pairs.iter().enumerate() {
        chains.push(pair_chain(k, pair));

        let chain = chains.len() - 1;
        let bodies = pair.geoms.map(|g| k.geoms[g].body);
        let tran = k.bodies[bodies[0]].invweight[0] + k.bodies[bodies[1]].invweight[0];
        let rows = if pair.condim == 1 { 1 } else { 2 * (pair.condim - 1) };
        let solref = solref_safe(pair.solref, dt, k.options.refsafe);
        let mu = pair.friction[0] * (1.0 / k.options.impratio.max(MIN_VAL)).sqrt();
        let first = pair.friction[0];
        let diag = if rows == 1 { tran } else { tran + first * first * tran };

        for index in 0..pair.max_contacts {
            out.push(ContactSlot {
                pair: p,
                index,
                chain,
                rows,
                row,
                diag,
                imp: Imp::new(pair.solimp, solref),
                mu,
                frictions: [pair.friction[0], pair.friction[1]],
                include_margin: pair.margin,
            });
            row += rows;
        }
    }

    out
}

impl Plan {
    pub fn new(kernel: Kernel) -> Self {
        let (m_adr, m_nnz, m_col) = matrix_pattern(&kernel);
        let friction = friction_rows(&kernel);
        let limits = limit_rows(&kernel);
        let mut chains: Vec<Chain> = (0..kernel.nv)
            .map(|d| Chain {
                dofs: vec![d],
                terms: vec![vec![]],
                hessian: Vec::new(),
            })
            .collect();
        let contacts = contact_slots(&kernel, &mut chains, friction.len() + limits.len());

        for chain in &mut chains {
            chain.hessian = hessian_index(&m_adr, &m_nnz, &m_col, &chain.dofs);
        }

        let nrows = friction.len() + limits.len() + contacts.iter().map(|c| c.rows).sum::<usize>();
        let mut row_kind = Vec::with_capacity(nrows);
        let mut row_chain = Vec::with_capacity(nrows);

        for f in &friction {
            row_kind.push(RowKind::Friction);
            row_chain.push(f.dof);
        }

        for l in &limits {
            row_kind.push(RowKind::Limit);
            row_chain.push(l.dof);
        }

        for c in &contacts {
            row_kind.extend(std::iter::repeat_n(RowKind::Contact, c.rows));
            row_chain.extend(std::iter::repeat_n(c.chain, c.rows));
        }

        let mut row_jadr = Vec::with_capacity(nrows);
        let mut row_len = Vec::with_capacity(nrows);
        let mut jcol = Vec::new();

        for &c in &row_chain {
            row_jadr.push(jcol.len());
            row_len.push(chains[c].dofs.len());
            jcol.extend_from_slice(&chains[c].dofs);
        }

        let njac = jcol.len();

        Self {
            nbody: kernel.bodies.len(),
            nm: m_col.len(),
            pattern: Pattern::new(&m_adr, &m_nnz, &m_col),
            kernel,
            m_adr,
            m_nnz,
            m_col,
            friction,
            limits,
            contacts,
            chains,
            nrows,
            row_kind,
            row_chain,
            row_jadr,
            row_len,
            jcol,
            njac,
        }
    }

    pub fn diag(&self, i: usize) -> usize {
        self.m_adr[i] + self.m_nnz[i] - 1
    }
}
