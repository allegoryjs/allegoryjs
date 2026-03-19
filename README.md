# Allegory.js

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="./images/allegory_logo_horizontal_light.png">
  <source media="(prefers-color-scheme: light)" srcset="./images/allegory_logo_horizontal.png">
  <img alt="AllegoryJS logo" src="./images/allegory_logo_horizontal.png">
</picture>

> **Status: Pre-Alpha / Heavy Development**
> *This repository is currently a construction zone. Architecture is being defined, and the kernel is being built.*

**Allegory.js** is a modern, web-native engine for simulation-based Interactive Fiction.

It aims to bridge the gap between traditional parser games (Inform 7, TADS) and systemic game design, bringing deep world simulation to the JavaScript ecosystem.

## The Vision

*   **Simulation, Not Trees:** The world state is managed by an ECS (Entity-Component-System) database, not a branching narrative tree. Objects have physics, weight, logic, and independent agency.
*   **Natural Language:** Built from the ground up to support modern NLP. The engine understands *Intent* ("Bowl the ball") rather than just strict syntax (`USE BALL ON LANE`).
*   **Web Native:** Games are built in standard TypeScript/JavaScript. They run in any browser, work on mobile, and can be styled with standard CSS.
*   **Fluent API:** Define your world using a human-readable chained syntax:
    ```javascript
    ThereIsAContainer('old_chest')
        .withDescription('A rotted wooden chest.')
        .is('locked')
        .containing('rusty_key');
    ```

## Architecture

AllegoryJS is built on a reactive, event-driven pipeline:
1.  **Input:** User text is routed via Semantic Embeddings to determine Intent.
2.  **Logic:** "Laws" (Middleware) bid on intents based on specificity.
3.  **Data:** A flat, relational ECS database manages the state.
4.  **Reaction:** World events trigger emergent behaviors in NPCs and systems.

See [TDD.md](./docs/TDD.md) for a technical deep dive.

## Roadmap

```mermaid
gantt
    title Allegory.js Development Roadmap
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d
    
    section Phase 1: The Kernel
    Ideation & Architecture           :done,    p1_1, 2026-01-01, 14d
    Core ECS Implementation           :done,    p1_2, after p1_1, 60d
    Intent Pipeline (Bidding/Sorting) :active,  p1_3, 2026-03-01, 30d
    Mutation Executor & Rollbacks     :active,   p1_4, 2026-03-12, 10d
    Event Bus & Pub/Sub               :         p1_5, after p1_4, 12d
    
    section Phase 2: NLP & Input
    Language Profile & Splitter       :         p2_1, after p1_5, 30d
    Integrate Transformers.js (WASM)  :         p2_2, after p2_1, 14d
    Vector Similarity Search          :         p2_3, after p2_2, 21d
    Salience System (Context Cache)   :         p2_4, after p2_3, 7d
    
    section Phase 3: The API
    Blueprint Registry (Deferred)     :         p3_1, after p2_4, 7d
    TypeScript Schema Inference       :         p3_2, after p3_1, 14d
    
    section Phase 4: Adventure Game Worldkit
    Fluent Builder (ThereIsA...)      :         p4_0, after p3_2, 30d
    Base Components (Location, etc.)  :         p4_1, after p4_0, 7d
    Physics Laws (Move, Take, Drop)   :         p4_2, after p4_1, 7d
    Perception Law (Look, Describe)   :         p4_3, after p4_2, 14d
    Maintenance Systems (Time, etc.)  :         p4_4, after p4_3, 7d
    Serialization (Save/Load)         :         p4_5, after p4_4, 5d

    section Phase 5: Tooling & CLI
    AST Code Extractor (ts-morph)     :         t1, after p4_5, 21d
    LLM Synonym Generator (Cloud API) :         t2, after t1, 14d
    Vector Packer (.bin Output)       :         t3, after t2, 7d
    Engine Runtime Index Loader       :         t4, after t3, 5d
    
    section Phase 6: Validation
    "Cyberpunk Saloon" Demo (WIP)     :         p5_1, after t4, 21d
    Bug Fixes & Engine Tweaks         :         p5_2, after p5_1, 7d
    
    section Phase 7: Launch
    Documentation (Guide & API)       :         p6_1, after p5_2, 10d
    Marketing Site Polish             :         p6_2, after p6_1, 4d
    Publish v1.0.0 to NPM             :milestone, m1, after p6_2, 1d
    Contribution/OSS Logistics        :         p6_3, after m1,   7d
    Post Launch Announce              :         p6_4, after p6_3, 3d
```

## Contributing

We are currently building the foundation. If you are interested in the architecture of text engines, feel free to watch the repo or open a discussion.

## A Note on AI

AllegoryJS uses AI to empower the player, not to replace the author.

- Understanding, Not Hallucinating: We use local AI models to parse user input (Natural Language Processing). This allows the player to type freely without guessing the exact verb syntax.

- Human-Crafted Stories: The engine is designed for hand-written narratives and rigorous logic. The AI determines what the player wants to do, but the game logic determines what happens next.

- Deterministic Simulation: Unlike LLM-generated games, AllegoryJS simulations are stable, debuggable, and handcrafted by the developer.

- Local Models First: The ML pipeline is run entirely inside of the player's browser; this allows for fully offline play, and is significantly faster and less wasteful than having the client rely on talking to a big LLM over the wire.

*License: MIT*
