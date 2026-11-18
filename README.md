# Hiding Spot

A first-person Three.js hide-and-seek game for primary ESL learners. Two to six players join a private room by code. One player hides in Fontana Vecchia, an Italian-inspired town at golden hour. Up to five seekers use English directions and landmark descriptions to find them.

## Deploy from GitHub to Render

1. Extract the ZIP and push the files inside `hiding-spot` to the root of a GitHub repository. Include `render.yaml` and `package-lock.json`. Leave `node_modules` out of Git.
2. In the Render dashboard, select **New → Blueprint** and connect that repository. Apply the included blueprint. It creates a Node web service with the build command `npm ci`, the start command `npm start`, and a health check at `/healthz`. For manual setup, create a **Web Service** and use those same settings.
3. Open the Render service URL. Create a room, then share the invite link with your players. Everyone plays at the same URL.

Keep the service on one instance. Rooms, scores and reconnect tokens are held in memory and reset when the process restarts. The included blueprint uses the free plan for trial runs. On that plan, the first request after idle time can take a while.

[Render Blueprints](https://render.com/docs/infrastructure-as-code) · [Node Express deployment](https://render.com/docs/deploy-node-express-app) · [WebSockets](https://render.com/docs/websocket) · [Free service limits](https://render.com/docs/free)

## Run locally

Use Node.js 22–24.

```sh
npm ci
npm start
```

Open `http://localhost:3000`. Use two browser tabs or devices to create a room and join it. For another device on the same network, open the computer’s local IP address on port 3000 and join by code. Use a WebGL 2 browser. Tablet players can switch **Controls** to **Touch** in the game menu if automatic detection isn't right.

## Play a round

- **Hider.** Use the countdown to choose a hiding place. Cross a courtyard, crouch beside a hedge or go prone under a market table. Stay hidden until the search clock runs out.
- **Seekers.** Approach a named villager and ask where they saw the hider go. A villager needs a clear view when the hider moves past. A clue describes the last sighting, so a moving hider may already have changed direction. A villager who saw nothing says “I do not know.”
- **Search circles.** A circle marks an approximate area on the map. The readout names the district and counts down to the next update.
- **Tools.** Binoculars zoom the first-person view. The drone uses the movement controls while the player stays on the ground. It can spot the hider in an open area, has a timed flight and needs to recharge.
- **Finish.** Get close to the hider, face them and tag them. The results show the winner, the number of villagers who gave each seeker a clue and a short English question.

| Action | Keyboard and mouse | Tablet |
| --- | --- | --- |
| Move | WASD or arrow keys | Drag the left stick |
| Look | Click the view, then move the mouse | Drag the view |
| Run | Hold Shift | Tap Run to toggle |
| Crouch / prone | C / Z. Press again to stand | Tap Crouch / Prone |
| Ask / tag | E | Tap the prompt near a villager or the hider |
| Map | M | Tap the minimap |
| Binoculars / drone | B / F | Tap the equipment buttons |
| Game menu | P. Esc releases the mouse | Tap ☰ |

**Word help** is available in the menu and on clue cards. Clue cards highlight terms such as *under*, *beside*, *north* and *striped*. Where the browser provides English text-to-speech, **Listen** reads the clue aloud.

## Host controls

| Setting | Default |
| --- | --- |
| Room size | 1 hider and up to 5 seekers |
| Town | 25 blocks. A 9-block version is also available |
| Timers | 45 seconds to hide, 6 minutes to seek |
| Hider assignment | Rotate each round. Random and host picks are also available |
| Movement | Running allowed. Hider can move during the search |
| Villagers | On. Sight radius 8 metres. Descriptive clues |
| Search circles | On. Every 60 seconds. Radius 24 metres |
| Binoculars | Unlock 40 seconds into the search |
| Drone | Unlock 105 seconds into the search. 18-second flight. 50-second recharge |

The host can also vary the building palette and details with the town seed, lock the room, remove a player, transfer host controls, pause or end a round. Settings changes apply between rounds. If you shorten a round, check that the equipment unlock times fall before the end of the search.

## Implementation

The Node server runs movement and collision, role assignment, villager sightings, search circles, drone range, tagging and scoring. Three.js renders the town and players. The shared map generator builds the same town from the host’s settings on each browser. Play takes place in outdoor streets, courtyards, gardens and covered spaces. Building doors represent façades.

Run `npm test` to verify map and cover geometry, multiplayer capacity, connection recovery, host permissions, visibility, round timing, clues, equipment and scoring.
