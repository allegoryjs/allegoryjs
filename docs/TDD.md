# AllegoryJS: Technical Architecture Strategy

## 1. Core Philosophy
**AllegoryJS** is a web-native, simulation-based Interactive Fiction engine. It bridges the gap between parser-based narratives (Inform 7) and systemic game design (Immersive Sims).

*   **Simulation-First:** World state is managed by a physics/logic simulation, not a narrative tree.
*   **Event-Driven:** The engine does not run a continuous 60fps loop. It functions as a **Request Processor**, idling until a user Input or System Event occurs.
*   **Web-Native:** Built on standard TypeScript/ESM to leverage the browser ecosystem (CSS, WebGL, Web Audio) without proprietary compilers.

---

## 2. The Data Model: ECS (Entity-Component-System)
The engine treats the game world as a relational database.

### 2.1. Structure
*   **Entities:** Simple Integers (IDs).
*   **Components:** Plain JSON data buckets (e.g., `Location`, `Portable`, `Openable`).
*   **Storage:** Columnar storage via `Map<ComponentName, Map<EntityID, ComponentData>>`.

### 2.2. Entity Lifecycle
1.  **Registry Phase (Deferred):** The API creates "Blueprints" (Promises of entities) to resolve circular dependencies (e.g., A Key inside a Box that doesn't exist yet).
2.  **Hydration Phase (Boot):** The engine instantiates Entities and resolves string references (IDs) into relational Component data.
3.  **Runtime:** Optimizations include:
    *   Tracking a `Set<Entity>` of active entities for O(1) existence checks.
    *   **Smallest-Set Intersection** queries for performance (`O(SmallestComponent)` vs `O(TotalEntities)`).

---

## 3. The Input Layer: NLP & Router
The engine separates **Intent** (What the user wants) from **Execution** (Physics).

### 3.1. Intent Classification
Instead of rigid string parsing, the engine uses **Semantic Embeddings** (Vector Search).
1.  **The Model:** A lightweight, quantized Embedding Model runs in the browser (e.g., via Transformers.js).
2.  **Definition:** Developers define Intents by example (e.g., `.onIntent('BOWL', ['roll the ball', 'strike the pins'])`).
3.  **Runtime:**
    *   The engine vectorizes the examples at boot (or loads pre-computed vectors).
    *   User input is vectorized and compared via Cosine Similarity.
    *   The nearest Intent Match is selected.

### 3.2. Target Resolution
*   **Verbs:** Handled by Vector Search.
*   **Nouns:** Handled by Fuzzy String Matching against the visible Entity list.

### 3.3. Compound Commands
The Input Router parses complex sentences ("Open the box and take the key") into a **Queue of Intents**. The engine processes these sequentially; if one fails, the remaining queue is aborted.

---

## 4. The Logic Layer: Laws & Middleware
Logic is decoupled from Entities. "Laws" act as middleware that intercept and process Intents.

### 4.1. The Pipeline Flow
1.  **Selection (Bidding):** The Engine identifies all Laws capable of handling the current Intent (e.g., `TAKE`).
2.  **Scoring (Specificity):** Laws are ranked to determine priority.
3.  **Execution (Request/Response):** The winning Law(s) execute in a two-pass protocol.
    *   *Pass 1 (Vote):* Validate logic. Return `SUCCESS`, `FAILURE`, or `PASS`. (No mutations occur).
    *   *Pass 2 (Commit):* If validated, return a **Result Object** containing Mutations (ECS updates) and Narration strings.

### 4.2. Specificity Scoring
To prevent conflicts, Laws are ranked using a **Tuple Sort** `[Layer, Score]`:

1.  **Layer (Hard Hierarchy):**
    *   *Layer 0 (Core):* Immutable physics (Gravity).
    *   *Layer 1 (StdLib):* Standard behavior (Inventory, Containers).
    *   *Layer 2 (Domain):* Game-specific rules (Magic, Combat).
    *   *Layer 3 (Instance):* Unique Entity scripts (`Excalibur.js`).
2.  **Score (Data Constraints):**
    *   Calculated by the number of constraints matched: `ID match` (+100) > `Property value` (+20) > `Component/Tag` (+10).

### 4.3. Specificity "Bidding"
Laws act as "Bidders." A generic `InteractionLaw` may bid on `PUSH`, but a `MartialArtsLaw` (looking for specific `Ninja` tags) will outbid it via Layer or Score, effectively overriding the behavior without hard-coded conditionals.

---

## 5. Reactivity: The Event Bus
The engine uses an **Observer Pattern** to handle side effects and emergence.

1.  **Trigger:** Upon a successful Transaction (Intent committed), the Engine emits a World Event (e.g., `ACTION_SUCCESS: { intent: DROP, target: GOLD }`).
2.  **Listeners:** Scripts, Quest Systems, and AI Agents listen for these events.
3.  **NPC Loop:** Agents do not "think" every frame. They are Reactive Listeners. An Event triggers an Agent logic block, which may generate a *new* Intent to be added to the queue (e.g., The Thief reacts to `DROP_GOLD` by queueing `TAKE_GOLD`).

---

## 6. Developer Experience (DX)
The API focuses on "Implicit Layering" and progressive disclosure.

### 6.1. Fluent API
Developers use a chainable builder pattern to define the world.
```javascript
ThereIsAContainer('chest')
    .withCapacity(10)
    .onIntent('OPEN', () => { ... }); // Implicitly assigns Layer 3 (Instance)
```

### 6.2. Moddability
*   **Data-Driven:** A "Mod" is simply a JavaScript file that registers new Laws or Archetypes.
*   **Conflict Resolution:** The Specificity System automatically resolves conflicts between mods (e.g., A "Fire Mod" Law automatically wraps the standard "Wood" Law via priority).
*   **No SDK:** Modding does not require a compiler; it uses the same API as the game developer.

---

## 7. Build & Distribution

### 7.1. Packaging
*   **Library:** AllegoryJS is distributed as a standard npm package (ESM).
*   **Bundling:** It is bundler-agnostic (works with Vite, Webpack, Next.js).
*   **No Build Tool Dependency:** The core engine does not require a custom CLI to run.

