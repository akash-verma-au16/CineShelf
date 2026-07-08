; CineShelf Player - Mouse-to-Keyboard Bindings
; AutoHotkey v2 syntax
;
; This script ONLY activates when the CineShelf Player overlay window is
; in focus. It has zero effect on any other app, including browsers.
;
; MAPPINGS:
;   Left click  [UI panels visible]  ->  real click (React handles it normally)
;   Left click  [native dialog open] ->  real click (dialog receives it)
;   Left click  [no UI visible]      ->  Space (play / pause)
;   Middle click                     ->  Escape (close the player)
;   Mouse Back  (XButton1)           ->  Left   (seek -10 seconds)
;   Mouse Fwd   (XButton2)           ->  Right  (seek +10 seconds)
;
; UI VISIBILITY:
;   Electron sets the window title to include "[UI]" whenever any panel
;   (title bar, controls bar, playlist sidebar) is visible.
;   It also adds "[DIALOG]" while a native file dialog is open so clicks are
;   never translated to play/pause during subtitle attachment.
;   AHK reads this title on every click — no mouse coordinates needed.
;
; Window scoping:
;   #HotIf matches on substring so both title variants are caught.

#Requires AutoHotkey v2.0

; Bypass flag: true while re-delivering a click so this hotkey does not
; intercept its own synthetic Click().
cineshelfPassthrough := false

#HotIf WinActive("CineShelf Player") && !cineshelfPassthrough

LButton:: {
    ; UI panels visible? Electron appends " [UI]" to the window title when any
    ; panel (title bar, controls bar, playlist sidebar) is open.
    ; Native dialog open? Electron appends " [DIALOG]" while the OS picker is active.
    title := WinGetTitle("A")
    if InStr(title, "[UI]") || InStr(title, "[DIALOG]") {
        ; At least one panel is open — pass the click through to React.
        cineshelfPassthrough := true
        Click()
        cineshelfPassthrough := false
    } else {
        ; All panels hidden (pure video area) — translate click to play/pause.
        Send("{Space}")
    }
}

MButton::   Send("{Escape}")  ; Close the player
XButton1::  Send("{Left}")    ; Seek back 10s  (overlay keydown: Left)
XButton2::  Send("{Right}")   ; Seek fwd  10s  (overlay keydown: Right)

#HotIf
