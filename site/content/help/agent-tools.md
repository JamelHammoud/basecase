---
title: Agent tools
date: 2026-11-13
updated: 2026-11-13
collection: agent
type: reference
order: 2
keywords:
  - mcp
  - tool calls
  - functions
  - capabilities
  - robotics_cad
related:
  - the-design-agent
  - agent-slash-commands
covers:
  - electron/cad-mcp-server.mjs
  - electron/cad-mcp/
  - src/linkage/agentLinkage.ts
  - electron/backend/sessionParams.mjs
---

Every tool the agent can call, grouped by job, so you can read what it's doing from the steps in the chat.

The tools come from one MCP server named `robotics_cad` inside Basecase. MCP is the protocol agents use to call an app's tools. Tools marked web need an internet connection.

## Scene and parts

| Tool | What it does |
|---|---|
| `get_scene` | Lists the scene's parts, one per line, and your marks |
| `find_in_scene` | Finds parts by words, group, kind, region or nearness |
| `get_part_code` | Reads a modeled part's code |
| `add_parts` | Adds block-out shapes and real catalog parts |
| `update_parts` | Moves, resizes, recolors, renames, regroups or re-notes parts, and rounds or bevels their edges |
| `delete_parts` | Removes parts |
| `mirror_parts` | Makes mirrored copies for left and right sides |
| `find_parts` | Searches the catalog of real parts, with sizes and prices |
| `model_part` | Models one part as code and places it in the scene |
| `set_status` | Shows a short status line in the app |

## Placing and fastening

| Tool | What it does |
|---|---|
| `get_ports` | Lists a part's mounting points |
| `mate` | Places a part by one of its mounting points against another |
| `fasten` | Adds a real screw, washer, insert or nut, and cuts the holes |

## Checking the design

| Tool | What it does |
|---|---|
| `look` | Renders the model from one or more views |
| `check_scene` | Finds parts that overlap, float or sit below the floor |
| `check_assembly` | Checks the robot can be put together and serviced, and lists printed parts that could print as one |
| `craft_review` | Flags parts that look plain or unfinished |
| `verify_design` | Runs the engineering checks: pass, warn or fail |
| `get_readiness` | Reads the Build tab's verdict |
| `dispute_finding` | Records why a blocker might be wrong |
| `get_guide` | Opens one of the agent's design guides |
| `find_recipes` | Finds proven code for common part features |

## Matching photos

| Tool | What it does |
|---|---|
| `compare` | Puts a reference image beside matching renders |
| `fit_view` | Works out where a photo's camera stood |
| `trace_outline` | Turns a photo's outline into points in millimeters |
| `photo_scale` | Sets millimeters per pixel from a part of known size |
| `score_fit` | Scores the model against the photos from 0 to 100 |
| `list_evidence` | Lists the files you attached |
| `read_evidence` | Opens a file you attached |

## The web

| Tool | What it does |
|---|---|
| `find_robot_description` | Searches GitHub for a robot's URDF or MJCF (web) |
| `robot_skeleton` | Reads exact joint positions from a URDF or MJCF (web) |
| `check_skeleton` | Checks the model's joints against the published robot (web) |
| `find_images` | Lists the images on a web page (web) |
| `view_image` | Downloads up to 4 images to look at (web) |
| `find_objects` | Searches NVIDIA SimReady objects (web) |
| `insert_object` | Inserts a SimReady object (web) |
| `add_sourced_item` | Adds a part from outside the catalog to the bill of materials (web) |
| `import_maker_cad` | Imports a maker's STEP or IGES file (web) |

## Joints and motion

| Tool | What it does |
|---|---|
| `define_skeleton` | Places the joints before any geometry |
| `set_interfaces` | Sets what each part designer must connect to |
| `check_interfaces` | Checks a subassembly against those connections |
| `define_joints` | Declares the robot's joints |
| `synthesize_linkage` | Fits a four-bar linkage to a path, and can add it with a servo on its crank |
| `find_joint_axes` | Finds the hinges in imported parts: each shaft or pin in a bore |
| `get_rig` | Lists joints, poses and animations |
| `pose` | Poses the robot without changing parts |
| `animate` | Makes keyframes or a walking gait |
| `retarget_motion` | Turns BVH motion capture into an animation |
| `import_robot` | Inserts a published URDF or MJCF robot |
| `make_leader` | Makes a leader arm you move by hand, in a new scene tab |
| `wrap_robot` | Wraps a robot in an imported mesh, cut into printed shells |

## Simulation, Cases, Routines and skills

| Tool | What it does |
|---|---|
| `simulate` | Runs the scene in MuJoCo |
| `set_world` | Places objects that exist only in the simulation |
| `start_drive` | Drives the robot in the simulation |
| `operate` | Steps the simulation and returns the robot's camera views |
| `create_case` | Adds a Case, with the inputs and panels it runs with |
| `write_case_code` | Writes or replaces one of a Case's code panels, and replies with its errors, its console lines, its refused calls and a picture of the window |
| `read_case_code` | Reads a code panel's source, or lists a Case's code panels |
| `delete_case_code` | Takes a code panel out of a Case |
| `run_case` | Runs a Case 20 times and reports how often it passed and why it failed |
| `compare_case` | Runs a Case on this robot and another open tab's, and says which passes more often |
| `explore_case` | Runs a Case on each catalog version of the robot's servos and supply voltage |
| `make_routine`, `read_routine`, `edit_routine` | Writes, reads and edits a Routine, and proves each new switch between skills in it |
| `test_routine`, `run_routine` | Tests and runs a Routine |
| `draft_skill` | Writes a skill's contract |
| `train_skill` | Trains a skill in the background |
| `training_status` | Reports training progress |
| `list_skills` | Lists the robot's skills |

## Build and cost

| Tool | What it does |
|---|---|
| `get_bom` | Reads the bill of materials |
| `check_printability` | Checks each part against your printer |
| `slice_plates` | Slices plates for print time and grams, without printing |
| `merge_parts` | Merges printed parts that `check_assembly` lists into one, when you ask |
| `set_build` | Sets extras, budget and filament |
| `build_guide` | Writes the printable assembly guide |
| `size_actuators` | Picks the cheapest servos that pass the torque checks |
| `sweep_design` | Tries a value on copies, without changing the scene |

With Claude Code, the agent can also start part designers, which are smaller agents that each model one subassembly. Every agent can also search the web, and Claude Code and Gemini CLI keep a to-do list.
