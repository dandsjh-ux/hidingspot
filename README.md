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

- **Hider.** Use the countdown to choose a hiding place. Cross a courtyard, crouch beside a hedge or go prone under a market table. Five buildings are open inside, so you can also slip into the bakery, school, café, pottery shop or church and hide behind a counter, a pillar or a pew. Stay hidden until the search clock runs out. When a villager notices you, you are not told straight away. Five seconds later a **!** appears on your map at that villager and floats over their head for a few seconds, so you learn that someone saw you but not at the moment it happened. Seekers see the same **!** on their map once the search starts, so a **!** shows them which villager to ask. Each alert carries the way the hider was running when that villager last saw them. The **!** on the map has an arrow showing that heading, a flat arrow lies on the ground in front of the villager, and an orange arrow near the middle of a seeker's screen points the same way (“Sofia: they went north-east”). If the hider had not started moving, the screen arrow points at the villager instead.
- **Seekers.** Approach a villager and ask where they saw the hider go. Villagers wander a few steps and look around, so they may have moved since you last saw them. A villager notices the hider only with a clear view and while facing the right way. Moving and running hiders are noticed from further away than ones standing still, and crouching or prone hiders only from close by. A clue describes the last sighting (“inside the warm bakery”, “under the low wooden table”), so a moving hider may already have changed direction. A villager who saw nothing says “I do not know.”
- **Names.** Every district has a signpost at two corners of its block. Named buildings have a large sign over the door and a hanging sign you can read along the street. The town map (**M**) labels each building. Gold buildings on the map have an open door.
- **Search circles.** A circle marks an approximate area on the map. The readout names the district and counts down to the next update.
- **Tools.** Binoculars zoom the first-person view. The drone uses the movement controls while the player stays on the ground. Its heat vision finds the hider within 25 metres, outdoors or inside a building, and shows a glowing outline through the roof. The hider's position stays pinged on the map for 10 seconds. The drone has a timed flight and needs to recharge.
- **Speed.** By default seekers move twice as fast as the hider, walking, running, crouching and crawling alike. The host can change this from 50% to 300% of the hider's speed.
- **Finish.** Run into the hider to catch them. Touching them is enough, with no button to press, but a wall between you stops a catch. The results show the winner, the number of villagers who gave each seeker a clue and a short English question.

| Action | Keyboard and mouse | Tablet |
| --- | --- | --- |
| Move | WASD or arrow keys | Drag the left stick |
| Look | Click the view, then move the mouse | Drag the view |
| Run | Hold Shift | Tap Run to toggle |
| Crouch / prone | C / Z. Press again to stand | Tap Crouch / Prone |
| Ask a villager | E | Tap the prompt near a villager |
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
| Movement | Running allowed. Hider can move during the search. Seekers move at 200% of the hider's speed (50–300%) |
| Villagers | On. They walk around. Sight radius 8 metres for a walking hider. Descriptive clues |
| Search circles | On. Every 60 seconds. Radius 24 metres |
| Binoculars | Unlock 40 seconds into the search |
| Drone | Unlock 105 seconds into the search. 18-second flight. 50-second recharge |

The host can also vary the building palette and details with the town seed, lock the room, remove a player, transfer host controls, pause or end a round. Settings changes apply between rounds. If you shorten a round, check that the equipment unlock times fall before the end of the search.

## Implementation

The Node server runs movement and collision, role assignment, villager sightings, search circles, drone range, tagging and scoring. Three.js renders the town and players. The shared map generator builds the same town from the host’s settings on each browser. Play takes place in outdoor streets, courtyards, gardens, covered spaces and five enterable buildings (bakery, school, café, pottery shop and church). The other building doors are façades.

Villager routes and looks come from the town seed, and a villager's position is a function of a shared round clock, so the server and every browser agree where each villager stands. A villager's chance to notice the hider depends on distance, stance, movement, the way the villager faces and a clear line of sight. Awareness builds over a moment, so a quick dash past at the edge of sight can go unnoticed.

Run `npm test` to verify map, interior and cover geometry, villager routes and awareness, multiplayer capacity, connection recovery, host permissions, visibility, round timing, clues, equipment and scoring.
