# VoxExam AI Tools Reference
# Version: June 2026 — Living Document

This document defines the role, capabilities, and limitations of every AI tool in the VoxExam development stack. It exists so Claude, Codex, ChatGPT, and Perplexity all operate with a shared understanding of who does what — and so Ali spends less time bridging gaps between tools.

---

## The Stack at a Glance

| Tool | Primary Role | Strength | Weakness |
|---|---|---|---|
| **Claude (Sonnet 4.6)** | Strategist, planner, task writer, evaluator | Reasoning, structured plans, prompt engineering, decision documentation | No live web access by default, not a builder |
| **Codex (GPT-5.5)** | Builder, repo editor, tester | Multi-file repo editing, running checks, creating PRs, Git operations | Can't reason about business/product decisions |
| **ChatGPT (GPT-5.5 Pro)** | Researcher, technical advisor, code reviewer | Deep Research, technical explanations, plain-English risk analysis | Not a repo editor, can hallucinate on incomplete context |
| **Perplexity Pro** | Fast cited research, first drafts | Web citations, quick answers, research summaries | Not a builder, not a decision maker |

---

## Claude — Role and Capabilities

### What Claude does in this stack
- Receives the founder's goal or problem
- Breaks it into a structured plan
- Writes precise Codex task instructions
- Writes research prompts for ChatGPT and Perplexity
- Evaluates research results and synthesizes decisions
- Documents decisions into the living document
- Reviews Codex output for product rule violations
- Writes professor emails, pitch decks, and stakeholder communication

### What Claude is strong at
- Architectural reasoning across the full VoxExam product
- Holding all project rules, constraints, and decisions in memory
- Writing Codex prompts that are precise enough to execute without back-and-forth
- Catching when a proposed change would violate a hard rule (evaluateWithAI, db:push, voice storage, professor approval)
- Plain language explanations of technical decisions for a non-technical founder
- Long-form strategy — product roadmap, adoption ladder, pilot planning

### What Claude is weak at or should not be used for
- Current information about tool capabilities, pricing, or API behavior — ask ChatGPT or Perplexity first
- OpenAI model behavior edge cases — Claude may guess incorrectly
- Executing code or verifying that code actually works — that is Codex's job
- Direct access to the GitHub repo without MCP setup

### When to send something to Claude
- You have a decision to make about VoxExam product or strategy
- You need a Codex task written precisely
- You need a research prompt written for ChatGPT or Perplexity
- You need to evaluate what ChatGPT and Perplexity returned
- Something broke and you need to figure out what to fix before telling Codex

---

## Codex — Role and Capabilities

### What Codex does in this stack
- Reads the VoxExam repo at `/Users/alimuhsenalahbabi/Documents/VoxExam`
- Implements features, fixes bugs, refactors code
- Runs checks: `npm run check`, `npm run lint`, `npm run build`
- Creates branches and PRs on GitHub
- Commits and pushes to GitHub main (with Git auth via PAT)
- Reads AGENTS.md and the VoxExam Skill before every task

### What Codex is strong at
- Multi-file editing across the full repo
- Following precise, structured task instructions
- Running terminal commands, checks, and builds
- Creating PRs with structured summaries
- Git operations — branching, committing, pushing

### What Codex is weak at or should not be used for
- Product decisions — it executes, it does not decide
- Tasks with vague instructions — always write precise task prompts
- Anything touching evaluateWithAI, db:push, or voice storage without explicit instructions

### Codex setup in this stack
- Model: GPT-5.5 (via OpenAI Pro bundle — free for Ali via UAEU ChatGPT Edu)
- Repo: `github.com/AliAlahbabi/VoxExam` (private)
- Local path: `/Users/alimuhsenalahbabi/Documents/VoxExam`
- Git auth: Personal Access Token (expires ~September 2026 — regenerate if push fails)
- VoxExam Skill: `.agents/skills/voxexam-project/` — auto-invoked on VoxExam tasks
- AGENTS.md: repo root — always read before any task

### Codex permission prompts — always select option 1
Codex asks permission before sensitive operations. Always select option 1 (Yes, this time) not option 2 (Yes, always) — keeping explicit approval for each action.

---

## ChatGPT (GPT-5.5 Pro) — Role and Capabilities

### What ChatGPT does in this stack
- Deep Research on technical topics with citations
- Technical explanations in plain English for the founder
- Code review when given a diff or file
- Second opinion on architectural decisions
- Research on OpenAI model behavior, API parameters, and tool capabilities
- Research on UAE regulations, Microsoft SSO, hosting options

### What ChatGPT is strong at
- Deep Research mode — multi-source cited reports on complex topics
- Explaining OpenAI product behavior accurately (it knows its own tools)
- Code review when given actual file content or diff
- Combining research from multiple sources into a clean recommendation

### What ChatGPT is weak at or should not be used for
- Direct repo editing — use Codex for that
- Final authority on code correctness — code must be run and tested
- VoxExam product strategy — Claude holds the full context

### When to send something to ChatGPT
- You need to know how an OpenAI model or product actually behaves
- You need deep cited research on a technical topic
- You need a second opinion on a Codex output (paste the diff)
- Claude explicitly says "ask ChatGPT first before we decide this"

### Models available (OpenAI Pro bundle)
- GPT-5.5 Pro — hard reasoning, architecture, high-stakes decisions
- GPT-5.5 Thinking — standard deep reasoning, code review, specs
- GPT-5.5 Instant — fast everyday questions
- Deep Research — multi-source cited research reports
- Agent mode — multi-step web/computer tasks with supervision

---

## Perplexity Pro — Role and Capabilities

### What Perplexity does in this stack
- Fast web research with direct source citations
- First-pass research when Claude needs external information
- Cross-referencing ChatGPT research results
- Quick factual lookups on tools, pricing, APIs, regulations

### What Perplexity is strong at
- Speed — faster than ChatGPT Deep Research for quick lookups
- Citations — always shows sources, easy to verify
- Current information — indexes the live web

### What Perplexity is weak at or should not be used for
- VoxExam product decisions — it doesn't hold the project context
- Building or editing code — it generates snippets but can't touch the repo
- Final authority on anything — always cross-reference with ChatGPT

### When to send something to Perplexity
- You need a fast cited answer on a current topic
- Claude sends a research prompt and says "send to both ChatGPT and Perplexity"
- You want to cross-check what ChatGPT said

---

## How the Tools Connect

### Current connection method — shared files
The tools do not talk to each other directly. They share information through:
- The GitHub repo (`github.com/AliAlahbabi/VoxExam`) — source of truth for all code
- `AGENTS.md` — always-on rules Codex reads before every task
- `.agents/skills/voxexam-project/` — VoxExam Skill with project context
- `VoxExam_New_Chat_Briefing.md` — briefing document for new sessions
- Ali copy-pasting between tools — current manual bridge

### Planned connection — ai/ shared folder pipeline
A shared folder inside the repo where Claude writes task files and Codex reads them:
```
VoxExam/
└── ai/
    ├── inbox/          Claude writes task files here
    ├── research/       ChatGPT/Perplexity research results go here
    └── outbox/         Codex writes build logs and results here
```
Status: planned, not yet built.

### Future automation — fswatch watcher
A macOS script that detects when Claude writes to `ai/inbox/` and triggers Codex automatically via CLI.
Status: planned, requires one-time terminal setup.

---

## Decision Routing — Which Tool Handles What

| Question or task | Route to |
|---|---|
| VoxExam product decision | Claude |
| Codex task instruction | Claude writes it |
| Research prompt | Claude writes it, ChatGPT + Perplexity execute it |
| How does OpenAI model X behave | ChatGPT first |
| How does Codex work on Mac | ChatGPT first |
| Current tool pricing or availability | Perplexity first |
| UAE regulations, PDPL, CAA | Perplexity + ChatGPT |
| Building a feature or fixing a bug | Codex |
| Reviewing a Codex PR for rule violations | Claude |
| Technical deep research with citations | ChatGPT Deep Research |
| Fast cited web lookup | Perplexity |
| Professor emails, pitch decks, stakeholder comms | Claude |
| Evaluating research results | Claude |

---

## Hard Rules for the AI Council

1. **Claude decides, Codex builds** — never ask Codex to make product decisions
2. **ChatGPT or Perplexity first** for any question about tool behavior, APIs, or current information — never rely on Claude's training data for these
3. **Codex always reads AGENTS.md** before any task — the Skill enforces this
4. **Never skip the research step** for a bug fix that involves model behavior — the silent audio bug taught us this
5. **One task at a time** — never give Codex two features simultaneously
6. **Always verify in Replit** before merging any PR
7. **Ali approves every Codex permission prompt** — never auto-approve all future commands

---

## Known Gaps and Open Questions

- How does `gpt-4o-mini-transcribe` behave on silent audio? — ChatGPT research pending, three-layer gate solution identified
- Can Claude Desktop MCP connect directly to Codex? — No native direct connection confirmed
- Can Codex Automations trigger on file change? — No, needs fswatch script
- Exact Codex Skill syntax and invocation behavior — confirmed via ChatGPT research, documented in `.agents/skills/voxexam-project/`

---

## Version History
- June 2026 — Initial version created based on ChatGPT, Perplexity, and Google AI research
