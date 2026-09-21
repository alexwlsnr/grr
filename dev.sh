#!/bin/sh
# Dev launch for THIS machine (dual-GPU KDE Plasma / Wayland). Two workarounds:
#
#   GDK_BACKEND=x11
#     KWin only honours the undecorated hint on X11; on native Wayland it
#     draws its own titlebar over our frameless window's in-page titlebar.
#
#   WEBKIT_DISABLE_COMPOSITING_MODE=1
#     WebKit's accelerated EGL/GBM path crashes on this dual-GPU setup
#     ("Failed to create GBM buffer"); software compositing works.
#
# On macOS / Windows: neither is needed.
exec env GDK_BACKEND=x11 WEBKIT_DISABLE_COMPOSITING_MODE=1 tinyjs dev "$@"
