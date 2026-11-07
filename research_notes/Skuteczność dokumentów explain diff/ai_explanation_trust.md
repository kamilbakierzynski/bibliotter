# Risks of AI-generated explanations of code (overreliance, false understanding, factual error) and the methods that reduce them

*Evidence tags used below. **[Strong]** = peer-reviewed, randomized or pre-registered, adequate sample, or replicated. **[Moderate]** = peer-reviewed but small, observational, self-report, simulated AI, or a proxy task. **[Weak]** = preprint, workshop paper, vendor data, blog, or a single setup. The tags are my judgement, not the authors'.*

*Reading depth. Most papers were read through a fetch tool that summarises pages with a small model, so numbers are extracted, not eyeballed. Lee 2025 and Doughty 2024 were checked directly against text I extracted from the PDFs. Items marked "(abstract/snippet only)" were not opened in full. PNAS, PMC and DOAJ refused automated access, so Bastani and Law rest on secondary or abstract-level sources, as noted. Check any figure against the paper before quoting it in a final report.*

*Almost none of these studies test an explanation of a diff read by its accountable reviewer. Most use lay participants on non-code tasks. Application to html-docs-app is inference and is labelled as such.*

## Do explanations increase overreliance? What works, for whom, at what cost in satisfaction?

### Takeaway
By default, explanations raise acceptance of AI output whether it is right or wrong. They reduce overreliance only when they make checking cheap enough or expose the error directly. Forcing functions and answer-withholding help, but they cost effort, are less liked, and help motivated people most.

### Cited Findings
- **[Strong]** Bansal et al., CHI 2021 (1,626 users; about 100 per condition; beer and book sentiment, LSAT; AI accuracy matched to human). Explanations did not significantly beat showing confidence alone (Beer 0.88 vs 0.89, z=-1.18, p=.24; Amzbook p=.22; LSAT p=.64). The paper states explanations "increased reliance on recommendations even when they were incorrect": accuracy rose when the AI was right and fell when it was wrong, netting to little. Adaptive explanations (shown fully only at low confidence) reduced agreement at low confidence but did not improve accuracy. Limits: crowd workers, low stakes, keyword highlights and short rationales only — [Bansal et al.](https://ar5iv.labs.arxiv.org/html/2006.14779)
- **[Strong, but simulated AI]** Vasconcelos et al., CSCW 2023 (five studies, N=731 per abstract; maze task; simulated AI fixed at 80% accuracy). Overreliance is a cost-benefit choice among doing the task, verifying, or relying. Results are Bayesian posterior differences with 95% CIs, not percentages:
  - Hard mazes: prediction-only produced more overreliance than a highlight explanation (1.74, CI 0.89–2.76). Easy mazes: no difference (0.16, CI -1.68–2.17), because people did the task themselves.
  - Easy-to-parse highlights beat written directions at medium and hard difficulty (-1.63 each).
  - A higher bonus reduced overreliance ($0.01 vs $0.50, difference 0.93, CI 0.41–1.46).
  - The exploratory "salient" explanation, which colours the path after it crosses a wall (shows where the AI went wrong), averaged 0% overreliance, with very wide intervals.
  - People placed higher subjective value on easier explanations (18.61 credits, highlight vs written).
  - Authors suggest null results elsewhere may arise because explanations did not lower verification cost enough — [Vasconcelos et al.](https://ar5iv.labs.arxiv.org/html/2212.06823); [abstract](https://arxiv.org/abs/2212.06823)
- **[Strong]** Buçinca et al., CSCW 2021 (N=199; simulated AI 75% accurate; nutrition task). Cognitive forcing functions were on-demand display, decide-then-update, and a 30-second wait.
  - Overreliance, forcing vs simple XAI: 0.26 vs 0.30 overall (n.s.), but 0.48 vs 0.64 on the sub-decision of spotting the carb source (p=.003, d=.36).
  - Correct decisions when the AI was wrong: 0.09 vs 0.03 (p=.003). People with no AI did better still (0.18), so overreliance was reduced, not removed.
  - Cost: forcing was rated more complex (2.95 vs 2.64). High need-for-cognition users gained most (0.11 vs 0.02, p=.002) yet trusted it less (3.56 vs 3.89) and preferred it less (3.44 vs 3.75). Low need-for-cognition users gained on the sub-decision only and showed no subjective penalty.
  - Authors warn of intervention-generated inequality and suggest applying forcing only where predicted to help — [Buçinca et al.](https://ar5iv.labs.arxiv.org/html/2102.09692)
- **[Strong]** Gajos & Mamykina, IUI 2022 (Exp 1 n=251, Exp 2 n=268, Exp 3 n=221, replication n=270; AI always correct). Scores are normalised gains.
  - Recommendation plus explanation improved decisions (0.341 vs 0.167 minimal) but not learning (0.206 vs 0.189).
  - The "update" design (answer first, then see AI) also showed no learning (0.121 vs 0.157 minimal, while explanation-feedback reached 0.354).
  - Explanation without a recommendation improved both decisions (0.422 vs 0.158) and learning (0.342 vs 0.138), replicated.
  - Learning was larger for high need-for-cognition users (0.388 vs 0.255, p=.02). Trust and preference were not measured — [Gajos & Mamykina](https://ar5iv.labs.arxiv.org/html/2202.05402)
- **[Strong]** Kim et al., CHI 2025, Honorable Mention (pre-registered, N=308, plus think-aloud N=16 with ChatGPT; the experiment used a hypothetical LLM, "Theta", on 12 hard factual questions):

  | Response | Agree, AI correct | Agree, AI wrong | Accuracy, AI wrong |
  |---|---|---|---|
  | Neither | 67.2% | 78.2% | 21.8% |
  | Explanation only | 78.2% | 82.8% | 17.2% |
  | Sources only | 73.4% | 68.2% | 31.8% |
  | Explanation + sources | 79.9% | 76.9% | 23.1% |

  Visible inconsistencies inside a wrong explanation cut agreement to 69.7% from 83.3% (p=.002) and raised accuracy to 30.3% from 16.7%. Explanations raised confidence on wrong answers too (5.47 vs 4.92 on a 1–7 scale). Caveats: only 3 of 12 wrong explanations had inconsistencies, unmanipulated; questions were deliberately hard; wrong answers seemed unusually plausible — [Kim et al.](https://arxiv.org/html/2502.08554)
- **[Moderate, conceptual]** Fok & Weld (perspective synthesising about 30 studies, no new experiment): explanations are useful only to the extent they let a human verify the prediction. Describing model reasoning does not. Verification is a spectrum and often one-sided. Intellective tasks allow it and judgmental tasks generally do not. Two failure modes: plausible but wrong, and right for the wrong reason — [Fok & Weld](https://ar5iv.labs.arxiv.org/html/2305.07722)
- **[Strong, broad]** Vaccaro et al., Nature Human Behaviour 2024 (meta-analysis of 106 experiments, 370 effect sizes): human-AI combinations on average performed worse than the better of human or AI alone, with high heterogeneity (abstract/snippet only) — [Vaccaro et al.](https://arxiv.org/abs/2405.06087v2)
- **[Strong]** Danry et al., CHI 2023 (N=204): turning explanations into questions improved detection of logically flawed statements over no feedback and over causal explanations from an always-correct AI (abstract/snippet only) — [Danry et al.](https://www.media.mit.edu/publications/don-t-just-tell-me-ask-me-ai-systems-that-intelligently-frame-explanations-as-questions-improve-human-logical-discernment-accuracy/)

### Inferences
- Treat "more explanation" as a risk factor, not a safeguard. A good-looking diff explanation may raise acceptance of the agent's work whether it is correct or not.
- The design target is verification cost per claim, not explanation quality. Prefer showing the code span next to the claim over a better paragraph.
- Salient error marking and visible inconsistencies are the strongest signals here. The analogue is to surface what the agent could not confirm, where tests disagree, and where the description and the code diverge, instead of smoothing it away.
- "Answer first" is not automatically enough: Update failed to produce learning in Gajos & Mamykina and only partly worked in Buçinca. Hiding the verdict while leaving the evidence seems to matter more than ordering alone. Explanation-only maps to "show evidence and let the reader form the verdict" instead of "this change is safe".
- Accountable reviewers are probably closer to the high need-for-cognition or high-stakes group, so forcing may help them and may also irritate them. That is inference; no study tests this population.

### Gaps
- No controlled study found that varies explanation and measures defect-catching on an agent-written diff.
- Per-study Ns extracted for Vasconcelos did not sum to the abstract's 731 (possibly shared conditions), so quote only the total.
- I could not confirm from the Vaccaro text whether explanations or confidence displays were moderators.

## Cognitive engagement versus passive reading of AI output

### Takeaway
Passive consumption of AI output repeatedly produces good immediate performance and weaker retained understanding, and people misjudge this. The best evidence is Bastani (field RCT). Designs that withhold answers remove the harm but do not reliably add learning. The EEG study is the weakest item and should not carry weight.

### Cited Findings
- **[Strong]** Bastani et al., PNAS 2025, preprint 2024 as "Generative AI Can Harm Learning" (field experiment, nearly 1,000 high school maths students in Turkey). GPT Base: practice +48%, later unassisted exam 17% worse than control. GPT Tutor (teacher input, hints rather than answers): practice +127%, exam about equal to control. So the guardrails removed the harm but showed no exam gain. Students who used AI were over-optimistic about their abilities. I could not open PNAS; figures come from Wharton's write-up and snippets, and one snippet notes the 17% came from the preprint — [Wharton](https://knowledge.wharton.upenn.edu/article/without-guardrails-generative-ai-can-harm-education/); [PNAS record](https://ideas.repec.org/a/nas/journl/v122y2025pe2422633122.html)
- **[Moderate: randomized and preregistered, but small and preprint]** Shen & Tamkin (Anthropic), 2026 (N=52, 26/26; crowd workers; learning Python Trio in 35 minutes; GPT-4o chat). This is the closest study to the product.
  - AI group scored 4.15 of 27 points lower on a no-AI quiz (d=0.738, p=.010). No significant speedup.
  - Largest gap was on debugging questions, smallest on code reading.
  - Six post-hoc usage patterns: delegation and iterative AI debugging averaged under 40%. Conceptual inquiry, hybrid code-explanation and generation-then-comprehension scored 65% or more. Cluster sizes were 2–7 and the patterns are associative, not causal. AI users also hit fewer errors (median 1 vs 3) — [Shen & Tamkin](https://arxiv.org/html/2601.20245v2); [Anthropic summary](https://www.anthropic.com/research/AI-assistance-coding-skills)
- **[Moderate: correlational, self-report]** Lee et al., CHI 2025 (319 knowledge workers, 936 examples).
  - Confidence in AI negatively associated with perceived critical thinking (β=-0.69, p<.001). Confidence in oneself positively associated (β=0.26, p=.026).
  - Critical thinking was reported for 555/936 (59%) of examples.
  - Task type had no main effect.
  - 83/319 said trust discouraged reflection, 58/319 lacked the ability to inspect output, and 72/319 could not improve it.
  - Effort moves from gathering to verifying, from problem-solving to integration, from execution to stewardship.
  - Limits, per the authors: participants conflated less effort using AI with less critical-thinking effort, and subjective confidence is not objective skill. The design is correlational, so it cannot show AI lowers critical thinking — [Lee et al.](https://advait.org/files/lee_2025_ai_critical_thinking_survey.pdf). Some coverage claimed exactly that — [example headline](https://analyticsindiamag.com/ai-news-updates/ai-use-reduces-critical-thinking-ability-says-new-microsoft-study)
- **[Weak]** Kosmyna et al., "Your Brain on ChatGPT" (arXiv preprint, v2 revised Dec 2025; no journal listed on the arXiv page; 54 participants in three groups, only 18 in session 4; EEG plus essay analysis). Reports weakest connectivity in LLM users and trouble quoting their own essays — [Kosmyna et al.](https://arxiv.org/abs/2506.08872). Stanković et al.'s commentary questions sample size, reproducibility, EEG method, reporting consistency and transparency, and urges conservative reading — [commentary](https://arxiv.org/abs/2601.00856). One detail flagged there: 55 completed but 54 analysed (snippet only) — [commentary PDF](https://arxiv.org/pdf/2601.00856)
- **[Moderate]** Fernandes et al., Computers in Human Behavior 2026: ChatGPT users performed better yet overestimated performance, the usual Dunning-Kruger pattern vanished, replication n=452, and higher AI literacy went with worse metacognitive accuracy (abstract/snippet only) — [Fernandes et al.](https://research.aalto.fi/en/publications/ai-makes-you-smarter-but-none-the-wiser-the-disconnect-between-pe/). Koch argues for "metacognitive decoupling" as the better framing — [Koch](https://arxiv.org/html/2603.29681)
- **[Moderate]** Perry et al., CCS 2023: participants with an AI assistant wrote significantly less secure code and were more likely to believe it was secure (abstract/snippet only) — [Perry et al.](https://arxiv.org/abs/2211.03622v1)
- **[Moderate]** Kazemitabaar et al., IUI 2025, the most direct test of friction on AI-generated code. Seven techniques vs immediately showing code plus explanation.
  - Study 1 (N=82): Lead-and-Reveal scored highest (58.3 vs 31.5), but p=.058 did not survive correction, and the authors estimate 153 were needed.
  - Study 2 (within-subjects, N=42): no significant performance difference (Trace-and-Predict 64.3, Baseline 57.6, Lead-and-Reveal 55.0; p=.150).
  - Time: 1.82x and 2.66x baseline. Trace-and-Predict had the highest load; Lead-and-Reveal did not raise it significantly.
  - Lead-and-Reveal was the only condition where perceived and actual ability correlated (r=.26, p=.017).
  - Verify-and-Review caused significantly more frustration.
  - Complaints: repetitive or trivial questions, no skip, no explanation after wrong answers — [Kazemitabaar et al.](https://arxiv.org/html/2410.08922v1)
- **[Moderate]** Counterweight: Kestin et al., Scientific Reports 2025 (about 180–194 Harvard physics students, crossover). A carefully structured GPT-4 tutor produced median learning gains more than double in-class active learning. Secondary summaries only; primary not opened. Critics note a short-term, elite, two-topic sample — [Kestin et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC12179260/)

### Inferences
- The same AI can harm or help learning depending on structure, so the harm is not inherent to AI. The relevant variable is whether the reader has to produce something.
- For this product, the outcome is understanding of one specific change rather than skill formation. The best proxy result is Shen & Tamkin's: reading comprehension held up best and debugging worst. A reader may feel they understand a diff and still be unable to predict how it fails.
- Passive reading of a polished interactive page is the GPT Base condition unless it asks for something. The honest expectation for added friction is better-calibrated self-assessment more than a large comprehension gain (Kazemitabaar).
- Make friction proportional to risk and skippable, or it will be resented (Kazemitabaar, Buçinca).

### Gaps
- No study found measuring retained understanding after reading an agent's explanation of its own diff, or whether the anchored-comment loop acts as engagement.
- Long-term effects are unknown; nearly everything here is single-session.
- I found no peer-reviewed publication of Kosmyna et al.

## Persuasive error: confident prose, LLM calibration and displaying uncertainty

### Takeaway
Well-formed LLM explanations can make false statements more believable than true ones, and reflective people are not reliably protected. LLM self-reported confidence is poorly calibrated, so showing it is unsafe. Uncertainty displays help when wording and signal source are right: first-person hedges and predicted-edit highlighting worked, while raw generation probability did not.

### Cited Findings
- **[Strong]** Danry et al., CHI 2025 (pre-registered, N=589, 11,780 observations): deceptive AI explanations were more persuasive than honest ones and shifted belief in false headlines upward and true ones downward more than bare true/false labels. Logically invalid explanations were judged less credible, which weakened the effect — [CHI version](https://www.media.mit.edu/publications/deceptive-explanations-by-large-language-models-lead-people-to-change-their-beliefs-about-misinformation-more-often-than-honest-explanations/). The earlier preprint (N=1,192) adds that cognitive reflection and trust in AI did not reliably protect people — [preprint](https://arxiv.org/abs/2408.00024). Note the two versions report different samples.
- **[Weak: arXiv]** Ajwani et al.: when asked to justify a wrong answer, LLMs raised human convincingness ratings (GPT-4 2.96 to 3.53; Claude 3.66 to 3.72; ChatGPT 3.74 to 3.84; all p<.01), using reframing (over 90% of NLI explanations), comparative framing and selective evidence. LLM proxy evaluators were unreliable stand-ins for humans. Suggested mitigation: generate rationales for multiple alternatives — [Ajwani et al.](https://arxiv.org/html/2405.06800v2)
- **[Strong]** Kim et al., FAccT 2024 (pre-registered, N=404; yes/no medical questions; fictional LLM search; hedges assigned randomly, not calibrated):
  - Agreement: 80.9% control vs 74.8% first-person hedge ("I'm not sure, but...").
  - Accuracy: 63.9% vs 72.8%; no AI 74.2%.
  - Confidence in the AI answer: 3.95 vs 3.66.
  - General hedges ("It's not clear, but...") moved the same way but were mostly non-significant (accuracy 67.9%).
  - Overreliance was reduced, not eliminated; accuracy on correct-AI items dipped slightly.
  - Trust intention fell (2.91 vs 3.25).
  - The authors warn against blanket mandates and call for context-specific testing — [Kim et al.](https://ar5iv.labs.arxiv.org/html/2405.00623)
- **[Moderate]** Vasconcelos et al., TOCHI 2024 (preregistered, 30 programmers; code completions): highlighting tokens with high predicted likelihood of being edited gave faster completion and more targeted edits and was preferred. Highlighting by generation probability was no better than nothing. It can flag correct but hard-to-predict names. Programmers wanted highlights to be granular, interpretable and not overwhelming (abstract/snippet only) — [Vasconcelos et al.](https://arxiv.org/abs/2302.07248v3)
- **[Moderate]** Spiess et al., ICSE 2025: alignment between an LLM's intrinsic confidence and correctness on code tasks is generally poor. Platt scaling helps but needs correctness data in advance (abstract/snippet only) — [Spiess et al.](https://arxiv.org/abs/2402.02047v4)
- **[Weak: outside code]** Medical vision-language benchmarks report overconfidence that scaling or prompting, including verbalized confidence, did not remove — [arXiv 2604.02543](https://arxiv.org/pdf/2604.02543). Factual QA work reports the same direction — [Mind the Confidence Gap](https://arxiv.org/html/2502.11028v3)
- **[Strong]** In Bansal, explanations gave no accuracy benefit over a confidence display — [Bansal et al.](https://ar5iv.labs.arxiv.org/html/2006.14779). In Kim 2025, explanations and sources both raised confidence on wrong answers, so justification quality is not a truth signal — [Kim et al.](https://arxiv.org/html/2502.08554)

### Inferences
- A diff explanation's polish carries no information about correctness, and polish is what the skill optimises. Readers will still treat it as evidence.
- Tie uncertainty markers to checkable facts, not to the model's feeling: "not run", "no test covers this branch", "inferred from name only". That sidesteps miscalibration because the marker reports what happened. The Vasconcelos TOCHI result supports preferring signals tied to real downstream need over raw model probabilities, by analogy.
- Hedge wording deserves a small test. Kim 2024 suggests "I did not verify this" may outperform an impersonal "unclear". Random, uncalibrated hedges worked there, but in a long-lived tool uninformative hedges would probably teach readers to ignore them.
- Generating the strongest alternative reading of a change (Ajwani's suggestion) counters cherry-picking cheaply.

### Gaps
- I found no study of verbal confidence or hedging in code explanations or diff documents.
- No evidence on whether repeated exposure erodes the effect of hedges (habituation).

## Accuracy of LLM code explanations and summaries: error types and measured rates

### Takeaway
Measured error rates are real but do not transfer to modern agents: roughly 12% wrong on simple comprehension questions for GPT-4, and about a third of summaries from smaller models contained hallucination. The failure pattern is stable and worrying: models read names, comments and framing, not semantics, and are weakest on tracing execution.

### Cited Findings
- **[Weak: preprint]** ETF (Java, CodeXGLUE snippets; Granite, Llama, CodeLlama and Mistral generators; no frontier models): 130 of 411 summaries (31.6%) labelled hallucinated. Causes:
  - Code complexity, the most common (nested conditions misread).
  - Identifier name bias: `getJobID` described as a database lookup when the code just returned -1.
  - Insufficient knowledge of libraries or context.
  - Natural language context: stale comments or logs mislead.

  Entity tracing detection: F1 0.73 vs 0.28 for direct prompting — [ETF](https://arxiv.org/html/2410.14748v4)
- **[Moderate]** Lehtinen et al., 2024 (399 questions on 60 small generated Python programs): GPT-3.5 69% correct, GPT-4 88%.
  - GPT-4 weakest on variable tracing (70%) and loop end (72%), strongest on naming questions (98–100%).
  - GPT-4's errors: hallucinated justification for a wrong answer (14), line number miscounted (13), illogical execution step (10). Hallucinated justification was the largest GPT-4 category, whereas GPT-3.5 made it only 3 times.
  - Errors resemble novice errors.
  - Limits: six exercises, one prompt, κ=0.501 — [Lehtinen et al.](https://ar5iv.labs.arxiv.org/html/2404.11734)
- **[Moderate]** Semantics-preserving mutation study (ICST 2026): for faults an LLM first localised correctly, semantics-preserving edits caused failure in 78% of cases. Misleading comments and dead code drove most of the loss, and dead code alone dropped average accuracy to 20.38% (abstract/snippet only) — [arXiv 2504.04372](https://arxiv.org/html/2504.04372)
- **[Weak: preprint]** "When Names Disappear": all models lost accuracy on summarisation and execution prediction under identifier obfuscation (abstract/snippet only) — [arXiv 2510.03178](https://arxiv.org/html/2510.03178v1)
- **[Moderate]** Gong et al., MSR 2026, the only directly agent-focused data found (23,247 agent PRs, 5 agents).
  - 406 (1.7%) had high message-code inconsistency.
  - Of those, 45.4% were Phantom Changes (claimed, not implemented), 22.0% Scope Understated (significant changes omitted), 18.8% placeholder text.
  - By agent: Copilot 8.7%, Cursor 4.5%, Claude Code 0.9%, Codex 0.8%, Devin 0.4%.
  - High-inconsistency PRs: 28.3% vs 80.0% acceptance, 55.8 vs 16.0 hours to merge (association).
  - Limits: heuristic detector with F1 0.63 that sees only gross mismatch, not semantic error; about 220 Claude Code PRs; closed PRs only — [Gong et al.](https://arxiv.org/html/2601.04886v2)
- **[Moderate]** Xue et al., 2024: LLM commit messages convey more "what" than "why", attributed to limited code context. 16-developer ratings on a 3-point scale: GPT-3.5 accuracy 2.71, readability 2.83 — [Xue et al.](https://arxiv.org/html/2404.14824v2)
- **[Weak: GPT-3.5 only]** Konstantinou et al.: LLM test oracles track implemented behaviour, not intended. When code was buggy, correct assertions were classified correct 8–9 points less often — [Konstantinou et al.](https://arxiv.org/html/2410.21136v1)

### Inferences
Mapping the four named error types to evidence:

| Error type | Best evidence | What it looks like in a diff explanation |
|---|---|---|
| Hallucinated behaviour | ETF 31.6%; Gong Phantom Changes | Describes a change or branch that is not in the diff |
| Wrong intent | Xue; Gong | Confident "why" built from a fragment |
| Omitted side effects | Gong Scope Understated 22% of cases | Silent on a migration, config or call-site effect |
| Code as it reads, not as it does | ETF name bias; mutation studies; Lehtinen trace errors | Describes `validate()` as validating when it returns early |

- Errors concentrate where review value is highest: tracing, control flow, and anything not visible in names. Summaries of naming-level structure will look right and teach the reader to trust the tracing claims.
- Agent self-narration about its own diff has an extra risk that a neutral summariser lacks: the agent remembers its intent and may report that rather than the result (Phantom Changes pattern). This is inference; no study isolates it.

### Gaps
- No measured error rate found for frontier agents (2025–2026) explaining diffs against ground truth.
- No study measuring omitted side effects as a rate per explanation.
- Sarsa et al. 2022 is often cited for code explanation quality, but I could not retrieve a correctness percentage — [Sarsa et al.](https://arxiv.org/abs/2206.11861)

## Verification techniques the generating agent can apply

### Takeaway
No technique has been tested end to end on code explanations. The strongest logic favours mechanical checks independent of the model's narration: captured tool output, machine-validated citations, and running code. Second-agent review and claim extraction have decent evidence for reducing errors but share blind spots. Passing tests and present citations are both weaker signals than they look.

### Cited Findings
**Citations and grounding**
- **[Strong]** Liu et al., Findings of EMNLP 2023 (Bing Chat, NeevaAI, perplexity.ai, YouChat; 1,450 queries each): 51.5% of generated sentences fully supported by citations, and 74.5% of citations supported their sentence. Perceived utility moved opposite to citation precision — [Liu et al.](https://arxiv.org/pdf/2304.09848)
- **[Strong]** Magesh et al., Journal of Empirical Legal Studies 2025: RAG legal tools marketed as hallucination-free still hallucinated in 17% (Lexis+ AI) and 33% (Westlaw AI-Assisted Research) of tested queries. 2024 product versions — [Magesh et al.](https://nlp.stanford.edu/~manning/papers/Magesh-Hallucination%E2%80%90Free-2025.pdf)
- **[Weak: one model]** Wallat et al., ICTIR 2025: a supporting citation does not prove the model used it. Up to 57% of citations lacked faithfulness (post-rationalization: citing what fits a prior belief). Command-R+ only — [Wallat et al.](https://arxiv.org/abs/2412.18004)
- **[Weak: vendor]** Anthropic Citations: sentence-chunked source passed with the query so Claude cites specific chunks. Anthropic reports up to 15% better recall; customer Endex self-reports source hallucinations falling from 10% to 0% — [Anthropic](https://claude.com/blog/introducing-citations-api)
- **[Strong]** Sources reduced overreliance on wrong LLM answers (68.2% vs 78.2% agreement) — [Kim et al.](https://arxiv.org/html/2502.08554). But citations also raised trust, even random ones, while few were ever checked — [Ding et al.](https://arxiv.org/html/2501.01303)
- Line-number errors are a known LLM failure (13 of GPT-4's incorrect answers) — [Lehtinen et al.](https://ar5iv.labs.arxiv.org/html/2404.11734)

**Running code, executable examples, attached output**
- **[Moderate]** Wang et al., ICSE 2026: on SWE-bench Verified, 7.8% of "correct" patches fail the developer suite. A further 29.6% of plausible patches behave differently from the reference, 28.6% of those certainly wrong. Resolution rates inflated by 6.2 points. Cause: validation covered only tests touched by the PR (abstract/snippet only) — [Wang et al.](https://arxiv.org/abs/2503.15223)
- **[Weak: GPT-3.5 only]** Konstantinou et al.: LLM-generated oracles tended to mirror implementation. Mutation scores about 18–20% (vs 17% EvoSuite), under 50% accuracy classifying given oracles — [Konstantinou et al.](https://arxiv.org/html/2410.21136v1)
- **[Weak: workshop]** Chen & Liu, NeurIPS 2026 workshop: given a final run of 1 failed, 17 passed, models sometimes report all passing, consistent with retrieving an earlier count or substituting the total. A required numeric field improved the passing count but did not reliably fix the full result — [Chen & Liu](https://neurips.cc/virtual/2026/168218)
- **[Weak: blog, LLM-judged]** Transluce, about 8,600 agent sessions: severe overselling of success 1.8% in a public dataset, 0.1% in internal traffic; any overselling 34.7% and 5.7%. Non-random samples — [Transluce](https://www.lesswrong.com/posts/smE9h9RnaK7FWKBZ2/measuring-coding-agent-misalignment-in-the-wild-1)

**Second pass by a separate agent**
- **[Strong]** Olausson et al., ICLR 2024: self-repair gains are modest once cost is counted. Critique is the bottleneck, and stronger-model feedback produced gains even where self-repair gave none. Human feedback still did better (abstract/snippet only) — [Olausson et al.](https://arxiv.org/abs/2306.09896)
- **[Weak: preprint]** Tsui: models failed to fix injected errors in their own reasoning 64.5% of the time on average, but reliably fixed identical external errors. Appending "Wait" cut this by 89.3% (abstract/snippet only) — [Tsui](https://arxiv.org/abs/2507.02778)
- **[Moderate]** Chain-of-Verification, Findings of ACL 2024: drafting, planning fact-check questions, answering them independently of the draft, then revising reduced hallucination on three task types (abstract only) — [CoVe](https://arxiv.org/abs/2309.11495)
- **[Strong]** Kim et al., ICML 2025: when two models both err on one leaderboard, they pick the same wrong answer 60% of the time. Larger models correlate highly even across providers (abstract/snippet only) — [Kim et al.](https://proceedings.mlr.press/v267/kim25e.html)
- **[Moderate/Weak: versions differ]** Mitropoulos et al.: PR metadata framing a change as bug-free collapses LLM vulnerability detection. v1 reports GPT-4o-mini 97.2% to 3.6%, with Claude 3.5 Haiku 68.4% to 8.5%, and misses growing far more than false positives — [v1](https://arxiv.org/html/2603.18740v1). The latest version (v5, Oct 2026, retitled) reports 33 CVEs and 32/33 success for a refinement attack, while templated attacks can backfire — [latest](https://arxiv.org/abs/2603.18740). In v1, instructing Claude Code to ignore metadata raised detection to 16 of 17.
- **[Weak: vendor guidance]** Claude Code docs: a fresh reviewer "hasn't seen your reasoning", but one asked to find problems "will always find *something*" — [Anthropic docs](https://code.claude.com/docs/en/best-practices)

**Claim extraction then checking**
- **[Moderate: authors' own framework]** Claimify, ACL 2025: extracts claims only where interpretation is confident, and beat AFaCTA, Factcheck-GPT, VeriScore, DnD and SAFE under its own framework (abstract/snippet only) — [Metropolitansky & Larson](https://arxiv.org/abs/2502.10855v1)
- **[Moderate]** SAFE: decompose, then check each fact. 72% agreement with crowd annotators on about 16k facts, judged right in 76% of 100 sampled disagreements, over 20x cheaper — [SAFE](https://arxiv.org/abs/2403.18802)
- **[Weak: preprint]** ETF applies this directly to code summaries, mapping summary entities to code — [ETF](https://arxiv.org/html/2410.14748v4)

### Inferences
| Technique | Evidence for the idea | Catches | Misses | Suggested use |
|---|---|---|---|---|
| Captured tool output pasted by script | Chen & Liu; Transluce | Misreported results | Weak tests | Default for every test claim; never let the agent retype results |
| Citation validated by script (file exists, line range, quoted text matches) | Lehtinen; Wallat; Magesh | Wrong locations, fabricated quotes | Post-rationalized or irrelevant citations | Store a quoted snippet with the file:line so it can be checked and survives line drift |
| Claim-by-claim entailment check | SAFE; Claimify; ETF | Unsupported claims | Consistent shared misreadings | Check against the code span alone, not against the explanation |
| Executable example with real output | Wang; Konstantinou | Behaviour claims that fail to reproduce | Whether behaviour is right | Label output as "observed", never "correct" |
| Characterization tests | Konstantinou | Regressions and actual behaviour | Bugs get pinned as expected | Use for "what it does"; never as proof of "what it should do" |
| Separate agent, code-first | Olausson; Tsui; CoVe; Mitropoulos | Author blind spots | Correlated model errors (Kim) | Give it the diff and the extracted claims first, without the narrative; add a different model for high-risk changes |

- Order matters. The Mitropoulos result implies a reviewer agent given the finished explanation is primed by it. Have it form its own account from the code, then compare.
- Require reviewers to report "no material issue found" as valid, per the vendor warning, or they will manufacture findings that become noise for the reader.
- Show a verification ledger in the document: claim, evidence type (ran / read / inferred), artefact. This gives readers the salient-error signal without asking them to audit everything.

### Gaps
- No experiment found that measures any of these on diff explanations, or their effect on the human reader.
- No evidence comparing same-model fresh-context review to different-model review for explanations. A blog figure exists but could not be verified, so I excluded it.
- Effect sizes for Chain-of-Verification were not extracted.

## Authors' intent versus implementation: separating "what it does" from "why"

### Takeaway
"What the code does" is checkable and "why it was done" usually is not, unless there is a record. Diffs mostly lack the motive. No study tests fact/inference labels in code documents, so a labelling scheme has to borrow from intelligence-analysis practice and should be validated.

### Cited Findings
- **[Moderate]** LLMs convey "what" better than "why", and models "can hardly capture the motivation behind code diffs" — [Xue et al.](https://arxiv.org/html/2404.14824v2)
- **[Moderate]** Good commit messages should state both why and what. About 44% of about 1,600 sampled messages could be improved, so the record that would supply intent is itself often missing (abstract only) — [Tian et al.](https://arxiv.org/abs/2202.02974)
- **[Moderate/Weak]** Textual intent context helps review: F1 up 72.17% on quality estimation with PR descriptions, near 80% with issue plus PR, more than code context alone (preprint; snippet only, verify the figures) — [Hu et al.](https://arxiv.org/abs/2511.07017v1). The same text can also blind review (Mitropoulos above) — [Mitropoulos et al.](https://arxiv.org/html/2603.18740v1)
- **[Moderate]** Phantom Changes are claims of intended work not present in the code — [Gong et al.](https://arxiv.org/html/2601.04886v2)
- **[Weak for code]** LLM-derived expected behaviour tends to collapse into implemented behaviour — [Konstantinou et al.](https://arxiv.org/html/2410.21136v1)
- **[Moderate, conceptual]** Verification is possible on intellective tasks and generally not on judgmental ones — [Fok & Weld](https://ar5iv.labs.arxiv.org/html/2305.07722)
- **[Non-empirical standard]** ICD 203 requires products to separate underlying information from assumptions and judgments and to state confidence and its basis. Text not retrievable by the fetch tool; relied on search extraction of the directive — [ICD 203](https://irp.fas.org/dni/icd/icd-203.pdf). An ODNI research paper notes the directive never defined confidence levels, so agencies apply them inconsistently (snippet only) — [ODNI](https://www.dni.gov/files/documents/FOIA/DF-2024-00001-NIU_Research_Short.pdf)

### Inferences
Suggested label set, based on source of evidence rather than on confidence:
- **Observed**: agent ran it; output attached.
- **Read**: from code at file:line; not executed.
- **Stated**: quoted from an issue, PR, commit, spec or the user's prompt, with link. For agent-authored code, the user's prompt or plan is real intent evidence that a neutral summariser lacks.
- **Inferred**: the agent's guess at motive. Must be phrased as a guess.
- **Unknown**: explicitly not determined.

Further suggestions:
- Note a subtle trap: an agent explaining its own code can truthfully report its intent, yet that intent is not evidence the code achieves it. Show "intended" and "observed" side by side and flag divergence.
- Do not ask for a numerical confidence; use a provenance label. It avoids the undefined-confidence problem and LLM miscalibration.
- Treat intent text as hypotheses under test: read the code first, then compare against stated intent.

### Gaps
- No empirical study of provenance or fact/inference labels in AI code explanations, and no data on whether readers notice them.
- No data on how accurately agents can report their own reasoning for a change. Self-reports may be post-rationalised, by analogy to Wallat.

## Do people verify? Following citations and sources, and how friction changes this

### Takeaway
Most people rarely verify. Citations mostly work as a trust cue. Checking does improve accuracy, at a real time cost. Verification rates depend on cost, stakes and motivation, and self-reports overstate them. Design for the majority who will not click, and make verifying cheap for those who will.

### Cited Findings
- **[Strong: large behavioural]** Wikipedia: 0.29% of page views produce a reference click (0.56% desktop, 0.13% mobile). 93% of citation links are never clicked in a month. Clicks are more common on shorter and lower-quality pages (snippet only) — [Piccardi et al.](https://arxiv.org/abs/2001.08614v1)
- **[Strong: behavioural panel]** Pew 2025 (900 US adults, 68,879 searches): links inside AI summaries clicked on 1% of visits. Result links clicked on 8% with a summary vs 15% without. Sessions ended on 26% vs 16% — [Pew](https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/)
- **[Strong]** Ding et al., AAAI 2025 (N=303): one citation raised trust (mean 7.73 to 8.10), five added little (8.17). Random citations raised trust less than valid ones, but only 9.77% of cited answers were checked, by 42.1% of participants. Checking lowered trust. Five-citation participants checked more (59 of 101 vs 24 of 96) — [Ding et al.](https://arxiv.org/html/2501.01303)
- **[Strong]** Kim et al., CHI 2025: 189 of 308 participants never clicked. Click rates 22–28%. Clicking associated with accuracy 60.1% vs 49.2%, and time 2.11 vs 1.08 minutes. In think-alouds, 7 of 11 cases of correctly overriding a wrong answer involved checking sources, yet 4 of 30 source checks still ended in agreeing with the wrong answer. Association, not causation — [Kim et al.](https://arxiv.org/html/2502.08554)
- **[Strong]** Kim et al., FAccT 2024: about 31–35% clicked sources, and self-reported use was much higher — [Kim et al.](https://ar5iv.labs.arxiv.org/html/2405.00623)
- **[Moderate: self-report]** 114/319 knowledge workers cross-referenced external sources; 23/319 checked sources the AI referenced — [Lee et al.](https://advait.org/files/lee_2025_ai_critical_thinking_survey.pdf)
- **[Weak: vendor survey]** Sonar 2026 (about 1,100 developers): 96% do not fully trust AI code being functionally correct, and 48% say they always check before commit — [Sonar](https://www.sonarsource.com/company/press-releases/sonar-data-reveals-critical-verification-gap-in-ai-coding/)
- **[Moderate: controlled but small; arXiv version read]** Tufano et al. (29 experts, over 50 hours of recorded reviews): reviewers given an LLM review focused on flagged locations instead of hunting elsewhere. More low-severity but not more high-severity issues found, no time saved, no confidence gain — [Tufano et al.](https://arxiv.org/abs/2411.11401v3)
- **[Moderate]** Tang et al. (28 developers, eye tracking, Copilot code): developers often do not recognise code provenance unless told (snippet only) — [Tang et al.](https://arxiv.org/html/2405.16081v1)
- **[Moderate: qualitative, focus groups]** Alami et al.: accountability in review comes from personal standards, integrity, pride and reputation. One cannot be accountable to an LLM, and the shift to collective ownership did not occur with AI feedback — [Alami et al.](https://arxiv.org/html/2502.15963v1)
- **[Strong, simulated]** Lower verification cost and higher stakes both reduce overreliance — [Vasconcelos et al.](https://ar5iv.labs.arxiv.org/html/2212.06823)

### Inferences
- Do not rely on file:line links as the verification mechanism. At best a minority will click, and the links will still raise trust among those who do not. Citation presence should never be the visual signal that something is verified.
- Reduce friction to near zero: inline code preview on hover or side-by-side, instead of a jump to another file. This is inferred from verification-cost findings; the exact effect is untested.
- Direct attention. The Tufano effect means the document controls where the reviewer looks, so listing "areas not examined" and "highest-risk code I cannot vouch for" could redirect the anchoring deliberately. Offering a small number of targeted checks for the riskiest claims is likely to work better than asking for checks on everything.
- A reader who is accountable for agent-written code may check more than crowd workers, so these rates are probably a floor, but Sonar suggests much less than total. Log comment and citation-opening behaviour locally to measure this in the real product, if the user wants it.
- Anchored comments are an unusual asset: they turn checking into a conversation and may restore some accountability loop, though Alami suggests an LLM reply does not replace peer accountability.

### Gaps
- No data on how developers treat file:line citations in AI explanations. All click data is from web or lay contexts.
- No experiment isolating the effect of friction on citation checking (for example hover preview vs link).

## Explanations generated from a diff without enough context

### Takeaway
The diff alone supports "what changed" but not motive, cross-file effects or correctness, and truncation causes false alarms and misses. More context helps until it adds noise, and textual intent context can help or bias. Nobody has established a quantity; slicing relevant code beats fixed windows.

### Cited Findings
- **[Moderate]** Diff fragments lack repository-wide context needed to infer motive — [Xue et al.](https://arxiv.org/html/2404.14824v2)
- **[Moderate]** Lu et al., ICML 2025 (Kuaishou; C++ services, hundreds of thousands of lines): segmenting by hunk or method drops declarations and definitions, misleading LLMs into false alarms or misses. Very long input also degrades results. Static-analysis slicing plus filtering gave 2x key-bug inclusion over standard LLMs (self-reported; no absolute figures in abstract) — [Lu et al.](https://arxiv.org/abs/2505.17928); [full text](https://arxiv.org/html/2505.17928v2)
- **[Weak: preprint]** AACR-Bench: many defects span files, and most benchmarks cover only diff fragments (snippet only) — [AACR-Bench](https://arxiv.org/pdf/2601.19494v2)
- **[Weak: preprint]** ContextCRBench: textual context often helps more than surrounding code; LLMs remain limited in review — [Hu et al.](https://arxiv.org/abs/2511.07017v1)
- **[Weak: preprint]** Insufficient contextual knowledge is a named hallucination cause, and stale comments in the context mislead — [ETF](https://arxiv.org/html/2410.14748v4)
- **[Moderate]** Misleading comments and dead code reduce correct analysis, so more text is not automatically better — [arXiv 2504.04372](https://arxiv.org/html/2504.04372)
- **[Weak: anecdote]** A vendor reports call-graph tracing stays reliable about 2–3 levels deep — [LlamaPReview write-up](https://dev.to/jet_xu/beyond-the-diff-how-deep-context-analysis-caught-a-critical-bug-in-a-20k-star-open-source-project-5hce)

### Inferences
Failure modes when explaining from the diff alone (derived from the above, and only partly measured):
- Invented motive.
- Missed callers and consumers, so side effects are omitted.
- Assumed semantics of unseen helpers from their names.
- Omitted invariants that the change breaks.
- Misread deletions.
- Scope presented as complete when it is not.

Consequences for the skill:
- The agent can read the repo, so it should not write from a diff alone. Run a coverage step: for each changed symbol, list callers, tests and config touched. State which were examined.
- Report the explanation's boundary. "I examined these 7 files; I did not check X" is a checkable statement, and supports the salient-error logic from question 1.
- Slicing (definitions, callers, tests of changed symbols) is better supported than loading whole files or the whole repository.

### Gaps
- No quantitative guidance on how much context is enough for explanation, as opposed to review.
- Most evidence comes from code review or commit messages; explaining a diff is an extrapolation.

## Self-assessment: is a quiz by the same agent a valid check? LLM-generated MCQ quality

### Takeaway
A same-agent quiz is not a valid check that the explanation is correct, because it cannot test what the agent itself misunderstands; at most it checks that the reader absorbed the agent's account. This is an argument from indirect evidence, as no direct study was found. LLM MCQs can be competent but have known flaws, and wrong-option exposure needs feedback. Fix: generate keys from execution or an independent agent, and target behaviour, not recall.

### Cited Findings
- **[Weak but direct analogue]** LLM-generated oracles follow the implementation they read: the test inherits the code's reality — [Konstantinou et al.](https://arxiv.org/html/2410.21136v1)
- **[Strong]** Critique is a bottleneck in self-repair — [Olausson et al.](https://arxiv.org/abs/2306.09896). Independent models still share errors (60% same wrong answer) — [Kim et al.](https://proceedings.mlr.press/v267/kim25e.html)
- **[Moderate]** Doughty et al., ACE 2024 (GPT-4 pipeline; 651 generated vs 449 human MCQs; 246 learning objectives; 6 programming courses). 81.7% of generated items passed all criteria. Multiple correct answers: 4.9% vs 1.1%, mostly at Apply and Create levels. Options giving away the answer: 4.0% vs 0.9%, mostly via the stem. Alignment to objectives was better than human items, partly an artefact of manual pairing. Raters scored 71.5% on generated vs 62.6% on human items, so generated items may be easier, though raters were not incentivised. Not tested in a live classroom — [Doughty et al.](https://arxiv.org/pdf/2312.03173)
- **[Moderate]** Law et al., BMC Medical Education 2025 (ChatGPT-4o vs human items in a real emergency medicine exam): discrimination about 0.22 vs 0.26; more factual errors in AI items (6% vs 4%); AI items mostly lower-order. Abstract-level via search only; verify before quoting — [Law et al.](https://pubmed.ncbi.nlm.nih.gov/39923067/); [catalogue record](https://library.kab.ac.ug/Record/doaj-art-de53e05697e64cf089061ab76fe225c3/Description)
- **[Moderate]** Tekin et al., 2025 (GPT-4 anatomy exam, 280 students): experts matched GPT-4's Bloom labels only 26.6% of the time, and items mainly assessed recall (snippet only) — [Tekin et al.](https://openaccess.altinbas.edu.tr/signposting/describedby/a539a30f-fbc0-42b3-a91c-bb5d758fbff3)
- **[Moderate]** Moore et al. 2023: on 200 student-written MCQs with a 19-item flaw rubric, a rule-based method caught 91% of human-identified flaws vs 79% for GPT-4 (snippet only) — [Moore et al.](https://arxiv.org/pdf/2307.08161)
- **[Strong: classic cognitive psychology]** Testing helps recall, but reading more multiple-choice lures increases later false answers — [Roediger & Marsh 2005](https://www.ovid.com/journals/jeplm/pdf/00004786-200509000-00024~the-positive-and-negative-consequences-of-multiple-choice). Immediate or delayed feedback reduces those intrusions — [Butler & Roediger 2008](https://mrbartonmaths.com/resourcesnew/8.%20Research/Formative%20Assessment/Feedback%20enhances%20the%20positive%20effects%20and%20reduces.pdf) (both snippet only)
- **[Moderate]** Item-writing rules are largely expert consensus, not experiment. Three options seem sufficient (Rodriguez 2005), and distractor quality matters more than count (snippet only) — [Haladyna et al. summary](https://bookdown.org/stefanmosjos/manualesitems/_book/haladyna-2002.html); [review](https://openpublishing.library.umass.edu/pare/article/1277/galley/1228/view)
- **[Moderate]** Kazemitabaar's team replaced multiple choice with short-answer questions after Study 1. Users disliked repetitive or trivial questions and missing explanations after wrong answers; self-assessment calibration improved only with Lead-and-Reveal — [Kazemitabaar et al.](https://arxiv.org/html/2410.08922v1)
- **[Moderate]** Tracing questions were GPT-4's weak spot (70%) while naming questions were near perfect, and template-generated questions can be built from program analysis rather than model opinion — [Lehtinen et al.](https://ar5iv.labs.arxiv.org/html/2404.11734)

### Inferences
A same-agent quiz measures agreement between reader and agent. If the agent's account is wrong, a high score certifies shared error and may deepen false confidence, exactly the metacognitive failure from question 2. Label it "check your understanding of this explanation", never "verified understanding".

Rules for improving validity, drawing on the sources above plus Doughty's prompt:
- **Independent key.** Derive answers from execution: "what does this function return for input X?", with the key from an actual run. Or have a separate agent answer from the code alone, without the explanation, and discard or flag disagreements. Disagreement is itself useful evidence that the explanation is ambiguous or wrong.
- **Ask about behaviour and failure, not narrative.** Prefer predict-the-output, what-breaks-if, and which-caller-is-affected over "what did this PR do?". This targets debugging-type understanding, the largest gap in Shen & Tamkin.
- **Ask before reveal, for high-risk parts.** Prediction before explanation is closer to explanation-only and Lead-and-Reveal.
- **Always give explanatory feedback**, with evidence links, after every answer, to prevent lures from sticking.
- **Build distractors from realistic misreadings**: name-implied behaviour, the old behaviour before the diff, the happy path only. Each should reflect a distinct misconception, be plausible, and be definitely wrong. Reject items with more than one defensible answer.
- **Three options suffice.** Keep option lengths similar, and avoid absolutes and answer clues in the stem. Randomise key position in code rather than trusting the model.
- **Run an item-flaw lint**: one check by rule script, one by a separate agent that tries to answer from the stem alone (cue test) and tries to argue for each distractor (multiple-key test).
- **Few questions, risk-targeted, skippable** on trivial sections. Short free-text answers are attractive because the agent can read them and answer later through the comment loop, which multiple choice cannot give.

### Gaps
- No direct study of whether a quiz by the same model detects errors in its own explanation.
- No reliable answer-key error rate found for LLM-generated MCQs; closest is Law's factual error rate and Doughty's multiple-correct rate.
- No study of comprehension quizzes embedded in AI code explanations, or of their effect on reviewer decisions.
- Most MCQ quality evidence comes from course content and medicine, not change-specific code comprehension.
