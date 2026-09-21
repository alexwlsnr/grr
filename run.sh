#!/bin/sh
# Run the BUILT standalone binary (dist/minesweeper + dist/launcher).
#
# The two env vars below are specific to THIS machine (dual-GPU KDE Plasma /
# Wayland) and are not needed on a stock desktop:
#
#   GDK_BACKEND=x11
#     Force X11/XWayland. KWin only honours the undecorated hint
#     (_MOTIF_WM_HINTS) on X11 — on native Wayland it ignores
#     set_decorated(FALSE) and draws its own titlebar over ours.
#
#   WEBKIT_DISABLE_COMPOSITING_MODE=1
#     Fall back to software compositing. WebKit's accelerated EGL/GBM path
#     crashes on this dual-GPU setup ("Failed to create GBM buffer").
#
# On macOS / Windows neither var is needed — frameless windows are natively
# undecorated there and there's no GBM path.
exec env GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1 \
  "$(dirname "$0")/dist/minesweeper" "$@"
