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

The agent can call every tool on this page, grouped by job. When the agent shows a step in the chat, you can look up the tool here.

Basecase provides all of them through one MCP server, `robotics_cad`. MCP is the protocol agents use to call an app's tools. A (web) tag means the tool needs an internet connection.

## Scene and parts

| Tool | What it does |
|---|---|
| `get_scene` | Lists your marks and the parts in the scene, one part per line |
| `find_in_scene` | Finds parts by words, group, kind, region or nearness |
| `get_part_code` | Reads the code for a modeled part |
| `add_parts` | Adds block-out shapes and real parts from the catalog |
| `update_parts` | Moves, resizes, recolors, renames or regroups parts, edits their notes, and rounds or bevels their edges |
| `delete_parts` | Removes parts |
| `mirror_parts` | Makes mirrored copies for the left and right sides |
| `find_parts` | Searches the catalog of real parts, with sizes, prices and how many you own |
| `model_part` | Models one part as code and places it in the scene |
| `set_status` | Shows a short status line in the app |

## Placing and fastening

| Tool | What it does |
|---|---|
| `get_ports` | Lists the mounting points on a part |
| `mate` | Places a part by one of its mounting points against another part |
| `fasten` | Adds a real screw, washer, insert or nut, and cuts the holes for it |

## Checking the design

| Tool | What it does |
|---|---|
| `look` | Renders the model from one or more views |
| `check_scene` | Finds parts that overlap, float or sit below the floor |
| `check_assembly` | Checks that you can put the robot together and service it, and lists printed parts that could print as one |
| `craft_review` | Flags parts that look plain or unfinished |
| `verify_design` | Runs the engineering checks, reports pass, warn or fail for each, and ends with what plugs where |
| `get_readiness` | Reads the verdict from the Build tab |
| `dispute_finding` | Records why a blocker might be wrong |
| `get_guide` | Opens one of the agent's design guides |
| `find_recipes` | Finds proven code for common part features |

## Matching photos

| Tool | What it does |
|---|---|
| `compare` | Puts a reference image next to matching renders |
| `fit_view` | Works out where the camera stood when someone took a photo |
| `trace_outline` | Turns the outline in a photo into points in millimeters |
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
| `import_maker_cad` | Imports a STEP or IGES file from the maker (web) |

## Joints and motion

| Tool | What it does |
|---|---|
| `define_skeleton` | Places the joints before any geometry exists |
| `set_interfaces` | Sets what each part designer must connect to |
| `check_interfaces` | Checks a subassembly against those connections |
| `define_joints` | Declares the robot's joints |
| `synthesize_linkage` | Fits a four-bar linkage to a path, and can add the linkage with a servo on its crank |
| `find_joint_axes` | Finds the hinges in imported parts: each shaft or pin that sits in a bore |
| `get_rig` | Lists joints, poses and animations |
| `pose` | Poses the robot without changing any parts |
| `animate` | Makes keyframes or a walking gait |
| `retarget_motion` | Turns BVH motion capture into an animation |
| `import_robot` | Inserts a published URDF or MJCF robot |
| `make_leader` | Makes a leader arm that you move by hand, in a new scene tab |
| `wrap_robot` | Wraps a robot in an imported mesh, cut into printed shells |

## Simulation, Cases, Routines and skills

| Tool | What it does |
|---|---|
| `simulate` | Runs the scene in MuJoCo |
| `set_world` | Places simulation-only objects |
| `start_drive` | Drives the robot in the simulation |
| `operate` | Steps the simulation and returns the views from the robot's cameras |
| `create_case` | Adds a Case with the inputs, panels and gestures it runs with, and marks which objects its code can move. In a scanned room, it aims at a door or a piece of furniture by name |
| `write_case_code` | Writes or replaces one of a Case's code panels. It replies with the panel's errors, console lines and refused calls, plus a picture of the window |
| `read_case_code` | Reads the source of a code panel, or lists the code panels in a Case |
| `delete_case_code` | Removes a code panel from a Case |
| `run_case` | Runs a Case 20 times and reports how often it passed and why it failed |
| `compare_case` | Runs a Case on this robot and on the robot in another open tab, and says which one passes more often |
| `explore_case` | Runs a Case on each catalog version of the robot's servos and supply voltage |
| `make_routine`, `read_routine`, `edit_routine` | Writes, reads and edits a Routine, and proves each new switch between skills in it |
| `test_routine`, `run_routine` | Tests and runs a Routine |
| `draft_skill` | Writes the contract for a skill |
| `train_skill` | Trains a skill in the background |
| `training_status` | Reports training progress |
| `list_skills` | Lists the robot's skills |
| `coach_skill` | Changes how a ready Motor Kit skill moves. It keeps the change if Arena passes the skill with it, and drops it if not |

## Build and cost

| Tool | What it does |
|---|---|
| `get_bom` | Reads the bill of materials |
| `record_on_hand` | Saves how many of a part you own |
| `check_printability` | Checks each part against your printer |
| `slice_plates` | Slices plates to get print time and grams, without printing |
| `merge_parts` | Merges the printed parts that `check_assembly` lists into one part, when you ask it to |
| `set_build` | Sets extras, budget, filament, and the power supply for a robot with no battery |
| `build_guide` | Writes the printable assembly guide |
| `size_actuators` | Picks the cheapest servos that pass the torque checks |
| `size_arm` | Sizes and places an arm from the points it must reach and the grams it carries |
| `sweep_design` | Tries a value on copies of the design, without changing the scene |

With Claude Code, the agent can start part designers: smaller agents that each model one subassembly. Every agent can search the web, and Claude Code and Gemini CLI keep a to-do list.
