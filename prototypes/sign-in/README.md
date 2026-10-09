# Sign-in screen prototype (#29)

> **Throwaway prototype.** It answers one question for [#29 Sign-in and app shell](https://github.com/Reilley64/mtgscan/issues/29): what should the sign-in screen look like? The PR #42 screen is too bare. Do not merge this to `main`.

## Open it

```sh
open prototypes/sign-in/index.html
```

You can also double-click `index.html`. It has no build step. Card images load from `cards.scryfall.io`.

## Variants

Use the bottom pill or the left and right arrow keys. `?variant=A` to `?variant=E` picks one.

- **A · Card fan.** Three commander cards fanned above the wordmark and tagline. The buttons sit at the bottom.
- **B · Commander art.** One commander art crop fills the screen with a slow pan. The art changes every 9 seconds. The wordmark, one line, and the buttons sit over a dark gradient.
- **C · Scanner demo.** A camera-style screen loops: a card slides in, the magenta outline locks on, and the latest-scan chip and batch count update. The copy and buttons sit below it.
- **D · Binder wall.** A dim wall of card images drifts upward behind a bottom sheet that holds the copy and buttons.
- **E · Quiet type.** A large wordmark, three feature lines with icons, and the buttons. No images.

## Dev menu

The dev menu at the top left sets the state in every variant: idle, signing in with Apple, signing in with Google, cancelled, failed, and signed in. `?state=` keeps the state across reloads.

A tap on a sign-in button runs a fake 1.5 s sign-in. "Tap result" sets what happens next: success opens a fake Recent screen with Sign out, cancelled returns to idle with no message, and fails shows "Sign-in did not work." with Try again. Try again returns to both buttons.

The dev menu can also turn on reduced motion and turn off card images. The page also follows the system reduced-motion setting.
