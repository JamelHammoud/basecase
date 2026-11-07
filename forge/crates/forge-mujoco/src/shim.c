#include <mujoco/mujoco.h>
#include <stdio.h>
#include <stdlib.h>

static void forge_error_handler(const char* message) {
  fprintf(stderr, "MuJoCo error: %s\n", message);
  exit(1);
}

static void forge_warning_handler(const char* message) { (void)message; }

void forge_install_handlers(void) {
  mju_user_error = forge_error_handler;
  mju_user_warning = forge_warning_handler;
}

int forge_state_integration(void) { return mjSTATE_INTEGRATION; }
int forge_state_warmstart(void) { return mjSTATE_WARMSTART; }
int forge_state_qpos(void) { return mjSTATE_QPOS; }
int forge_state_qvel(void) { return mjSTATE_QVEL; }
int forge_state_ctrl(void) { return mjSTATE_CTRL; }
int forge_state_time(void) { return mjSTATE_TIME; }

int forge_obj_joint(void) { return mjOBJ_JOINT; }
int forge_obj_actuator(void) { return mjOBJ_ACTUATOR; }
int forge_obj_body(void) { return mjOBJ_BODY; }
int forge_stage_none(void) { return mjSTAGE_NONE; }

int forge_nq(const mjModel* m) { return (int)m->nq; }
int forge_nv(const mjModel* m) { return (int)m->nv; }
int forge_nu(const mjModel* m) { return (int)m->nu; }
int forge_nbody(const mjModel* m) { return (int)m->nbody; }
int forge_ngeom(const mjModel* m) { return (int)m->ngeom; }
int forge_ngain(void) { return mjNGAIN; }
int forge_nbias(void) { return mjNBIAS; }
double forge_timestep(const mjModel* m) { return m->opt.timestep; }

int forge_jnt_qposadr(const mjModel* m, int joint) { return m->jnt_qposadr[joint]; }
int forge_jnt_dofadr(const mjModel* m, int joint) { return m->jnt_dofadr[joint]; }
int forge_ctrl_limited(const mjModel* m, int actuator) { return m->actuator_ctrllimited[actuator] != 0; }
int forge_history_samples(const mjModel* m, int actuator) {
  return m->actuator_historyadr[actuator] < 0 ? 0 : m->actuator_history[2 * actuator];
}

double* forge_ctrlrange(const mjModel* m) { return m->actuator_ctrlrange; }
double* forge_gainprm(const mjModel* m) { return m->actuator_gainprm; }
double* forge_biasprm(const mjModel* m) { return m->actuator_biasprm; }
double* forge_dof_armature(const mjModel* m) { return m->dof_armature; }
double* forge_dof_damping(const mjModel* m) { return m->dof_damping; }
double* forge_dof_frictionloss(const mjModel* m) { return m->dof_frictionloss; }

double* forge_qpos(const mjData* d) { return d->qpos; }
double* forge_qvel(const mjData* d) { return d->qvel; }
double* forge_ctrl(const mjData* d) { return d->ctrl; }
void forge_set_time(mjData* d, double t) { d->time = t; }
double forge_time(const mjData* d) { return d->time; }
