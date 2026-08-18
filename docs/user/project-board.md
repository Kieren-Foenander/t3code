# Project boards

Each project opens on a board that keeps its threads and working context in one spatial workspace.
Open a project from the home screen, or select a project in the sidebar and choose **Open project
board**. Selecting or double-clicking a thread frame opens the same durable thread; returning to the
board restores your camera and active thread.

Pan with the mouse wheel, trackpad, middle mouse button, or Space-drag. Pinch or use the zoom
controls to zoom, and choose **Frame all** (or press Home) to fit the board. At a distance, thread
frames collapse to status or summary views. Their full timeline and composer appear only when you
zoom close enough. Running threads outside the viewport appear as quiet edge indicators. Select a
thread and choose the target icon to follow it; turning follow off restores your previous view.

## Threads and artifacts

Double-click empty space or choose **New thread** to place a draft exactly where you are working.
The thread becomes durable when you send its first message. You can also add durable notes, project
file references, diagram shapes, connectors, and soft visual groups. File references use
project-relative paths and always show current server-owned content unless marked with a checkpoint.

Select an object and use Alt+Arrow keys to move it. Arrow keys move selection, Enter opens a
selected thread, Escape clears the active thread, and + or - changes zoom. Deleted notes remain
recoverable while **Show deleted** is enabled.

## Sharing context with agents

A connector is visual only; it never grants an agent access. To share an object with the active
thread, select it and choose **Read** or **Edit**. **Detach** revokes future access without rewriting
conversation history. **Full board** grants or revokes edit access to the current and future board.

Agents receive a compact manifest of only the context they may access and can fetch selected objects
on demand. Board edits use revision checks, and multi-object edits commit atomically. Notes and
shapes created by an agent record their originating thread so their provenance stays visible.

## Mobile

Mobile shows the same synchronized board as a touch-first overview. Drag horizontally and vertically
to explore, then tap a thread frame to open its normal thread screen. Camera and selection are kept
locally on the device; board content and permissions remain server-owned and sync across clients.
