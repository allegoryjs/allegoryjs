# Allegory.js: Technical Design Document (v3)

## 1. Core Philosophy
**Allegory.js** is a web-native, simulation-based Interactive Fiction engine designed to bridge the gap between parser-based narratives and systemic game design. It prioritizes **Simulation over Scripting** (world state is managed by an ECS database) and **Intent over Syntax** (NLP replaces rigid verb parsing). The architecture follows a "Micro-Kernel" approach, where the core engine manages data flow, while game logic is supplied via a robust, replaceable Standard Library.

---

## 2. Data Model: The ECS (Entity-Component-System)
The engine treats the game world as a flat, relational database optimized for dynamic composition.

### 2.1. Structure
*   **Entities:** Represented as unique Integers (IDs). They act as keys to access Component data.
*   **Components:** Typed JSON data buckets defined via a generic `ComponentSchema`. They hold state (`Location`, `Portable`) but no logic.
*   **Storage:** Columnar storage using `Map<ComponentName, Map<EntityID, ComponentData>>`. This allows for efficient querying of all entities possessing a specific trait.

### 2.2. Entity Lifecycle
*   **Creation:** New entities are bootstrapped with required system components (`Tags`, `Meta`) to ensure data consistency.
*   **Querying:** Queries use a "Smallest-Set Intersection" strategy (iterating the rarest component first) to ensure performance remains $O(N)$ relative to the smallest group, not total world size.
*   **Destruction:** A robust `destroyEntity` method ensures the ID is removed from all Component stores and the Active Entity set to prevent "Zombie References."

### 2.3. Safety Facade
*   **Read-Only Context:** Laws and Scripts never access the ECS directly. They receive a `WorldQuery` facade that exposes read methods (`get`, `query`) but hides mutation methods (`set`, `add`), enforcing the Command Pattern.

---

## 3. The Input Layer: Unified NLP Strategy
The engine uses a modern, client-side NLP pipeline to decouple the player's vocabulary from the game's internal IDs.

### 3.1. Pre-Processing (i18n Strategy)
Input is sanitized via a configurable `LanguageProfile` (Default: English, using `compromise.js`).
*   **Mode Detection:** Detects questions (e.g., "Can I...?") to flag the Intent as a `DryRun` (Validation Pass only).
*   **Command Splitting:** Breaks compound inputs ("Take sword AND eat apple") into a sequential Queue of distinct commands.
*   **Structure Extraction:** Separates the **Command** ("Hit the window") from the **Tool/Instrument** ("with the rock") to populate the Intent slots.

### 3.2. Intent Classification (Verbs)
*   **Embeddings:** Uses `Transformers.js` (WASM) to convert the user's Verb phrase into a vector.
*   **Matching:** Compares the input vector against a pre-computed index of **Intent Examples** (e.g., "hurl" matches `THROW`).
*   **No Training:** The model is not fine-tuned. It uses "Few-Shot" examples defined by the developer, allowing for instant runtime updates to the vocabulary.

### 3.3. Entity Resolution (Nouns)
*   **Unified NLP:** Nouns are resolved using the same Vector Search strategy as verbs. The Cloud Build step generates synonyms for entities (e.g., `r_sword_01` -> "rusty blade"), allowing fuzzy semantic matching.
*   **Candidate Lists:** The Resolver does **not** pick a single winner. It returns a list of **Top Candidates** (e.g., "Sword in Hand" and "Sword on Floor") based on Vector Score + Salience.
*   **Salience Context:** Scores are boosted if the entity exists in the `Engine.SalienceMap`, allowing the engine to prioritize local/visible items without hardcoding "Room" logic.

---

## 4. The Logic Layer: Laws & Middleware
Logic is implemented as **Laws**, which act as prioritized middleware bidding to handle specific Intents.

### 4.1. Law Structure
*   **Filter:** A fast check ("Do I handle `TAKE`?") to prevent unnecessary processing.
*   **Matchers:** A declarative schema defining valid **Scenarios**. Each scenario groups Actor and Target constraints (e.g., "Actor has Key AND Target is Locked").
*   **Apply:** A pure function receiving the `Context` and `Candidates`. It selects the best candidate and returns a `LawResult` (Mutations + Narration).

### 4.2. Specificity Scoring
Laws are sorted dynamically per-execution using a **Tuple Sort** `[Layer, Score]`.
*   **Layers:** A hard hierarchy ensuring order: Core (0) < StdLib (1) < Domain (2) < Instance (3).
*   **Score:** A calculated sum based on data constraints: ID Match (100pts) > Property Value (20pts) > Component Presence (10pts). Higher specificity overrides lower specificity.

### 4.3. Execution Protocol
*   **Pass 1 (Vote):** Laws check validity. If the `isDryRun` flag is set, the engine stops here and reports success/failure.
*   **Pass 2 (Commit):** If valid, the engine accepts the `LawResult`.
*   **The Chain:** The engine runs laws in priority order. If a Law returns `PASSED`, the chain continues (adding flavor). If it returns `COMPLETED`, the chain stops. If it returns `REJECTED`, the entire transaction rolls back.

---

## 5. Systems & Reactivity
While Laws handle "Subjective Action" (Player Inputs), Systems handle "Objective Simulation" (World Maintenance).

### 5.1. Systems (Maintenance)
*   **Role:** Calculate derived state and maintain consistency. They run at the end of every Tick.
*   **Salience System:** A critical system (e.g., `PerceptionSystem`) that scans the world relative to the player and populates the `SalienceMap` cache for the next turn's resolution.
*   **Independence:** Systems are independent of Laws. A `DecaySystem` can rot food regardless of whether the player interacts with it.

### 5.2. Event Bus (Emergence)
*   **Trigger:** When the Kernel successfully executes Mutation Ops, it emits semantic events (e.g., `ACTION_SUCCESS`).
*   **Listeners:** Scripts and Agents listen to these events. This allows for emergent behavior (e.g., a Guard NPC noticing `TheftEvent` and queueing a `Attack` intent).

---

## 6. Build & Distribution
The engine minimizes tooling friction, favoring a "Library" approach over a "Framework" approach.

### 6.1. Package Strategy
*   **Library:** Distributed as a standard NPM package (ESM). It is bundler-agnostic and works with Vite, Webpack, or Next.js.
*   **No Compiler:** The core engine does not require a build step to run. It creates entities and logic at runtime.

### 6.2. Cloud Services (Monetization)
*   **Synthetic Data Generation:** A CLI tool scans the codebase for Entities and Intents, uploads metadata to the Allegory Cloud, and uses an LLM to generate synonym vectors.
*   **Value Prop:** This saves the developer from writing manual NLP training data ("rusty sword", "old blade", "jagged metal") while keeping the runtime download size small (vectors only, no model weights).

---

## 7. Developer Experience (DX)
*   **Fluent API:** A `ThereIsA...` builder pattern allows developers to define entities and logic in natural-reading chains, handling Deferred Resolution of IDs automatically.
*   **Ejectable Themes:** Premium UI Kits are sold as source code templates (e.g., "Cyberpunk UI"), giving developers full ownership and customization power without dependency lock-in.
*   **Implicit Layering:** The API automatically assigns Specificity Layers based on usage (e.g., `.onIntent()` implies Instance Layer), hiding the complexity of the bidding system from the casual user.
