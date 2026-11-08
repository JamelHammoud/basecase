#include <mujoco/mujoco.h>
#include <mujoco/mjxmacro.h>
#include <string.h>

#define FORGE_KIND(value) _Generic((value), double: 0, int: 1, float: 2, unsigned char: 3, char: 3, _Bool: 3, default: 4)

void* forge_model_array(const mjModel* m, const char* name, int* kind, int* rows, int* cols) {
  MJMODEL_POINTERS_PREAMBLE(m)
#define XNV X
#define X(type, field, nr, nc)       \
  if (!strcmp(name, #field)) {       \
    *kind = FORGE_KIND(m->field[0]); \
    *rows = (int)m->nr;              \
    *cols = (int)(nc);               \
    return (void*)m->field;          \
  }
  MJMODEL_POINTERS
#undef X
#undef XNV
  return NULL;
}

int forge_model_size(const mjModel* m, const char* name, long long* value) {
#define X(field)                  \
  if (!strcmp(name, #field)) {    \
    *value = (long long)m->field; \
    return 1;                     \
  }
  MJMODEL_SIZES
#undef X
  return 0;
}

#define FORGE_SCALAR(field)        \
  if (!strcmp(name, #field)) {     \
    out[0] = (double)o->field;     \
    return 1;                      \
  }
#define FORGE_VECTOR(field, n)                                 \
  if (!strcmp(name, #field)) {                                 \
    for (int i = 0; i < (n); i++) out[i] = (double)o->field[i]; \
    return (n);                                                \
  }

int forge_model_option(const mjModel* m, const char* name, double* out) {
  const mjOption* o = &m->opt;
  FORGE_SCALAR(timestep)
  FORGE_SCALAR(impratio)
  FORGE_SCALAR(tolerance)
  FORGE_SCALAR(ls_tolerance)
  FORGE_SCALAR(noslip_tolerance)
  FORGE_SCALAR(ccd_tolerance)
  FORGE_SCALAR(sleep_tolerance)
  FORGE_VECTOR(gravity, 3)
  FORGE_VECTOR(wind, 3)
  FORGE_VECTOR(magnetic, 3)
  FORGE_SCALAR(density)
  FORGE_SCALAR(viscosity)
  FORGE_SCALAR(o_margin)
  FORGE_VECTOR(o_solref, mjNREF)
  FORGE_VECTOR(o_solimp, mjNIMP)
  FORGE_VECTOR(o_friction, 5)
  FORGE_SCALAR(integrator)
  FORGE_SCALAR(cone)
  FORGE_SCALAR(jacobian)
  FORGE_SCALAR(solver)
  FORGE_SCALAR(iterations)
  FORGE_SCALAR(ls_iterations)
  FORGE_SCALAR(noslip_iterations)
  FORGE_SCALAR(ccd_iterations)
  FORGE_SCALAR(disableflags)
  FORGE_SCALAR(enableflags)
  FORGE_SCALAR(disableactuator)
  return 0;
}

#undef FORGE_SCALAR
#undef FORGE_VECTOR

void* forge_data_array(const mjModel* m, const mjData* d, const char* name, int* kind, int* rows, int* cols) {
#define XNV X
#define X(type, field, nr, nc)       \
  if (!strcmp(name, #field)) {       \
    *kind = FORGE_KIND(d->field[0]); \
    *rows = (int)m->nr;              \
    *cols = (int)(nc);               \
    return (void*)d->field;          \
  }
  MJDATA_POINTERS
#undef X
#undef XNV
  return NULL;
}

int forge_data_ncon(const mjData* d) { return d->ncon; }

int forge_data_nefc(const mjData* d) { return d->nefc; }

void forge_data_contact(const mjData* d, int i, double* dist, double* pos, double* frame, int* geom) {
  const mjContact* c = d->contact + i;
  *dist = c->dist;
  for (int k = 0; k < 3; k++) pos[k] = c->pos[k];
  for (int k = 0; k < 9; k++) frame[k] = c->frame[k];
  geom[0] = c->geom[0];
  geom[1] = c->geom[1];
}

double* forge_data_efc(const mjData* d, const char* name) {
  if (!strcmp(name, "efc_pos")) return d->efc_pos;
  if (!strcmp(name, "efc_D")) return d->efc_D;
  if (!strcmp(name, "efc_R")) return d->efc_R;
  if (!strcmp(name, "efc_aref")) return d->efc_aref;
  if (!strcmp(name, "efc_force")) return d->efc_force;
  if (!strcmp(name, "efc_frictionloss")) return d->efc_frictionloss;
  if (!strcmp(name, "efc_diagA")) return d->efc_diagA;
  if (!strcmp(name, "efc_J")) return d->efc_J;
  return NULL;
}

int* forge_data_efc_type(const mjData* d) { return d->efc_type; }
