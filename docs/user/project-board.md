# Project boards

Each project opens on a board that keeps its threads and working context in one spatial workspace.
Open a project from the home screen, or select a project in the sidebar and choose **Open project
board**.

Pan with the mouse wheel, trackpad, middle mouse button, or Space-drag. Two-finger pinch zooms
around the gesture while the midpoint pans. Use the zoom controls and choose **Frame all** (or press
Home) to fit the board. At a distance, thread frames collapse to status or summary views. Their full
timeline and composer appear only when you zoom close enough. Running threads and agent-changed
artifacts outside the viewport appear as quiet edge indicators. Follow tracks committed work from
one agent; turning it off restores your previous view.

## Threads and artifacts

Double-click empty space or choose **New thread** to place a draft exactly where you are working.
If a thread is active, the new thread appears beside it and records a spawned-from relationship. The
thread becomes durable when you send its first message. **Attach thread** or double-click enters the
full chat; **Detach to board** returns without losing the local camera, selection, or active target.

You can add notes, project file references with line ranges, diagram shapes, labelled connectors,
and soft visual groups. Notes begin as working notes and can be promoted to durable project
artifacts. File references use project-relative paths; live cards read current server-owned content,
while checkpoint-pinned cards retain historical content and report when the current source differs.
Select the pencil or resize controls to revise shapes, groups, file ranges, and connectors.

Select an object and use Alt+Arrow keys to move it. Arrow keys move selection, Enter opens a
selected thread, and + or - changes zoom. Escape is reserved for dismissing the control that owns
focus; it never enters or exits a thread. Deleted artifacts remain recoverable while **Show
deleted** is enabled. Archived threads collapse to compact board cards without moving or deleting
their artifacts.

## Sharing context with agents

A connector, group, or nearby position never grants access. To share an object with the active
thread, select it and choose **Read** or **Edit**, or drag it onto a thread frame for read access.
Press S for read, Shift+S for edit, and D to detach the selected artifact. **Detach** revokes future
access without pretending to erase information already delivered to conversation history.

Project default read and edit controls apply to threads without overrides. Per-thread **Full read**
and **Full edit** controls grant access to current and future board objects without granting control
over sibling agent sessions.

Agents receive a compact manifest of only explicitly shared context. Small notes are available
directly, large artifacts remain lazy tool references, and spatial selections are divided into
readable tiles when the provider supports images. Every provider also receives the complete
structured fallback. Board edits use revision checks, and multi-object edits commit atomically.

Agent operations record their thread, turn, provider, and affected objects in **Recent agent
activity**. Undo there changes only board history; it never restores a Git checkpoint or rewrites a
provider conversation.

## Mobile

Mobile shows the same synchronized board as a touch-first overview. Drag horizontally and vertically
to explore, then tap a thread frame to open its normal thread screen. Camera and selection are kept
locally on the device; board content and permissions remain server-owned and sync across clients.
