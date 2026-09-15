# Refine the cereal game and Raven theme

## Changes
- Slow the cereal spawn acceleration so difficulty rises steadily instead of spiking early.
- Handle each cereal piece on pointer-down, allowing every physical mouse click to register without the delayed click event.
- Prevent clicks on the finished play area from immediately starting another round.
- Add a clear game-over layer showing the final score and a separate “Play again” button.
- Rename the theme option from “Raven 🐦‍⬛ (mascot)” to “Raven 🐦‍⬛”.
- Upscale and sharpen the existing Raven background to match the 4K Raven Summer artwork without changing its composition.
- Add these changes to the next-release notes and verify the game states, theme label, image resolution, and app build.

## Technical details
- Keep the fixed 460×300 play area and existing physics.
- Use a slower bounded spawn curve and pointer events with propagation stopped on cereal pieces.
- Keep replay as an explicit control inside the game-over layer.
- Produce a 3840×2160 Raven background from the current artwork using high-quality resampling and restrained sharpening.
