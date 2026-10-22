# The Beautiful Game

A browser football game in the spirit of EA FC and eFootball: simple pseudo-3D visuals, believable physics, and both keyboard+mouse and controller support.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # physics, movement and camera tests
npm run build    # typecheck + production build into dist/
```

Plug in a controller and press any button. The game switches to whichever device you touched last.

## Controls

| Action | Keyboard + mouse | Controller |
| --- | --- | --- |
| Move | WASD / arrows | Left stick |
| Sprint | Shift | RT or RB |
| Aim | Mouse | Left stick direction |
| Pass | Right click or J | A / Cross |
| Shoot | Left click or K | B / Circle |
| Chip / lob | E or L | X / Square |
| Camera | C | View / Share |

Hold a kick button to charge and release to kick.

## How it is built

TypeScript + Canvas 2D + Vite, with no game engine or physics library.

- `src/sim/` is the simulation in metres and seconds, stepped at a fixed 120 Hz. The ball is "2.5D" (pitch position plus height), with gravity, air drag, bounce, rolling friction and swerve. Players have capped acceleration, so turning at speed costs momentum. The simulation never touches the DOM, so it can be unit-tested.
- `src/input/` turns keyboard, mouse and Gamepad API ("standard" mapping) input into one `Actions` value, so gameplay code never knows which device is in use.
- `src/render/` holds a perspective camera that projects the simulation (broadcast, low and end-to-end presets) and procedurally animated stick figures whose stride follows the distance they actually cover.
- `src/config.ts` keeps every tuning constant in one place.

## Roadmap

1. **Feel** (this): one player, ball and keeper.
2. **Small-sided**: 5v5, player switching, tackles, shoulder challenges, first CPU team AI.
3. **Full match**: 11v11, set pieces, simple offside and fouls, clock, radar.
4. **Polish**: local 2-player, team picker, difficulty, sound, button remapping.
