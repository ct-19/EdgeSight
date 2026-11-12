# Mission EdgeSight

**AI-assisted mission intelligence that keeps working when communications drop.**

Tactical units can collect more sensor data than they can assess in the field. Mission EdgeSight helps operators turn that data into a clear picture of what was observed, what changed, and what deserves a closer look. It processes observations on local hardware and delivers useful findings into tools operators already use, including the Team Awareness Kit (TAK).

Out of the box, EdgeSight detects wireless devices, flags unusual emitter activity, and links detections to available imagery. Its core workflow runs at the edge in degraded, denied, intermittent, and limited-bandwidth (DDIL) environments. Local processing and buffering continue during a communications outage; delivery to remote systems depends on the connection. Teams can add sensors, AI models, and applications without rebuilding the stack.

This public repository is a showcase for Mission EdgeSight. It contains screenshots, short demo clips, wallpapers, and Codex pets. Product source code and deployment packages are distributed separately.

## From a signal to something an operator can review

A wireless sensor picks up an emitter. EdgeSight retains the observation locally and checks whether it has appeared before or behaved unusually. When the data supports it, EdgeSight can suggest a probable source area and surface related imagery for review. The operator can see the evidence, judge how strong the association is, and review relevant findings in the Operations Console or TAK.

An unusual signal is a cue to investigate. A probable source area is an estimate, and a nearby visual detection does not establish who owns or operates a device.

## Services and operator tools

| Service | What it does |
| --- | --- |
| **Field Collection** | Receives observations from connected sensors. It buffers observations locally when a link drops so they can be forwarded when connectivity returns. |
| **ECHO — Wireless Observation** | Detects and organizes observations from wireless devices. It provides RF evidence that downstream services can use to compare encounters and assess behavior. |
| **Birdwatcher — Emitter Behavior** | Reviews RF observation history for persistence, recurrence, and unusual patterns. It can flag possible movement alongside a collection platform for an operator to investigate. |
| **Pathfinder — Source-Area Estimation** | Uses geolocated signal-strength observations and movement of the collection platform to suggest an area to search. The result is a probable area, not a precise fix. |
| **Lookout — Visual Detection** | Identifies objects in available camera imagery and provides visual observations for review or correlation. Camera coverage and available imagery determine what it can contribute. |
| **CrossCue — RF and Visual Association** | Compares a selected emitter and its estimated source area with visual detections to find evidence that separate sensors may be observing the same activity. |
| **Mission State** | Normalizes and retains observations and mission history so operators and services can refer back to the same evidence as it arrives or changes. |
| **Mission Context and Assessment** | Uses areas of interest, routes, and supporting observations to help operators judge why an event matters. The evolving case workflow adds a shared view of prior encounters, evidence, uncertainty, and suggested next steps. |
| **TAK Bridge** | Publishes eligible mission events to TAK using Cursor on Target (CoT), so operators can review selected findings in familiar map workflows. |
| **Operations Console** | Gives operators a place to review detections, sensor and service health, mission areas, and supporting media. The after-action review (AAR) view brings together recorded mission evidence. |
| **Insight and nSIght — AI Mission Analyst** | Insight powers mission questions in the console. With a configured local model, nSIght can answer follow-up questions, summarize recorded activity, and point back to events and media an operator can inspect. Operators can also browse recorded mission evidence without a model. |
| **Mission Packs** | Bundle reusable services, integrations, and mission configurations so teams can adapt the stack to different sensors, hardware, and workflows. |

The wireless collection-to-TAK workflow has been demonstrated end to end. Analytics, camera integrations, and case workflows vary by configuration and maturity. Advanced sensor fusion and adaptive recommendations are still evolving.

## What to look for in the showcase

- **Screenshots:** The Operations Console, mission areas and routes, evidence views, TAK presentation, and after-action review.
- **Demo clips:** Follow an observation through the system: detection, review of unusual activity, related imagery, and delivery to an operator view.
- **Wallpapers:** Mission EdgeSight artwork for desktop backgrounds.
- **Codex pets:** **nSIght** and **nSIght Scanner**, animated takes on the AI analyst. The Scanner edition has a single rectangular eye that sweeps a cyan focus bar and narrows it as it locks onto a detail.

Use the media to see what EdgeSight puts in front of an operator: what happened, what evidence supports it, and what still needs a human judgment.
