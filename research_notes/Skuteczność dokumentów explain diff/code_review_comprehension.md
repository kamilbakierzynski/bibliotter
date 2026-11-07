# How developers understand code changes: empirical findings for structuring a diff explanation

Evidence tags, used on every finding: **[EXP]** controlled experiment, **[QUASI]** causal inference on observational data, **[MINING]** repository mining, correlational, **[FIELD]** deployment or before/after, **[SURVEY]**, **[QUAL]** interviews, think-aloud, diaries, **[SIMULATION]** in-silico model, **[THEORY]** or **[OPINION]** conceptual or practitioner argument.
Read depth: **(FT)** full text opened and read, **(ABS)** abstract or landing page only, **(SEC)** only a search excerpt or secondary summary.
Status markers: "preprint" means no peer-reviewed venue was visible. "Vendor" means the authors work for the company whose tool is evaluated.

## 1. What do reviewers need to know, and what do they struggle to obtain?

### Takeaway
Review is mainly a comprehension task. The most valued information is *why* the change exists, which is easy to get only when the author wrote it down. The hardest information is non-local: whether similar places also need the change, what else breaks, how runtime behavior shifts, and whether the change is complete. No part of a diff shows these directly.

### Cited Findings
- [SURVEY+QUAL] (FT) Microsoft, 180 responses from 1,279 invitations, plus follow-up email interviews. Reviewing others' changes is the top scenario requiring change understanding (67.2%), and reviewing one's own is also common (40.6%). Over 36% need to understand changes several times a day — [Tao et al. FSE 2012](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/07/howdosoftwareengineersunderstandcodechanges_fse2012.pdf)
- [SURVEY] (FT) Of 15 information needs, five scored "very important" (>2 on a 0-3 scale): rationale, completeness, correctness, design impact, and "does this change break any code elsewhere?". Historical churn and defect hot-spot data ranked lowest in importance — [Tao et al. 2012](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/07/howdosoftwareengineersunderstandcodechanges_fse2012.pdf)
- [SURVEY] (FT) Hardest to acquire, in order: consistency ("are there any other places that need similar changes?"), breakage elsewhere, altered dynamic behavior, completeness. Rationale, the most important need, was the *easiest* to get, but only when a good description exists — [Tao et al. 2012](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/07/howdosoftwareengineersunderstandcodechanges_fse2012.pdf)
- [SURVEY+QUAL] (FT) Microsoft: 17 developers observed, 873 programmers surveyed (44% response). Understanding emerged unprompted as the main challenge. One senior developer: "the most difficult thing when doing a code review is understanding the reason of the change". Understanding was also the second most frequent comment category, whereas defects ranked fourth of nine at 14% — [Bacchelli & Bird ICSE 2013](https://web.eecs.umich.edu/~weimerw/2018-481/readings/codereview.pdf)
- [SURVEY] (FT) Finding defects needs the most understanding of all review outcomes, followed by proposing alternatives. 91% say unfamiliar files take longer because reviewers must learn "purpose, invariants, APIs". 82% say reviewers who know the files give different feedback, which is deeper and catches subtler issues. Reviewers talk to the author in person for 20-40% of reviews — [Bacchelli & Bird 2013](https://web.eecs.umich.edu/~weimerw/2018-481/readings/codereview.pdf)
- [QUAL] (FT) File owners often skip the description and go straight to their files. Non-owners depend on it and judge it good when it states "what was changed and why" — [Bacchelli & Bird 2013](https://web.eecs.umich.edu/~weimerw/2018-481/readings/codereview.pdf)
- [QUAL+SURVEY] (FT) Ten interviews plus ratings of 98 changes from 35 developers. Change description, code churn and commit history were the top reviewability factors. The description was the most mentioned aspect, and nine of ten interviewees stressed stating motivation alongside what changed. Tests served as a quick presence and coverage check for nine interviewees — [Ram et al. FSE 2018](https://zenodo.org/records/1323659/files/preprint.pdf)
- [MINING+QUAL] (FT) 900 comments from three OSS projects yielded seven needs: alternative-solution suitability, correct understanding, rationale, code context, necessity, specialized expertise, splittability. The two most prominent were alternatives and "is my understanding correct?". Replies took a median of seven hours — [Pascarella et al. CSCW 2018](https://sback.it/publications/cscw2018.pdf)
- [QUAL+MINING] (FT) Google: 12 interviews, 44 survey responses, logs of 9M changes. Expectations center on education, norms, gatekeeping and accident prevention rather than problem solving — [Sadowski et al. ICSE-SEIP 2018](https://sback.it/publications/icse2018seip.pdf)
- [MINING] (FT) Google's median change is 24 modified lines, over 35% touch one file, and about 90% touch fewer than 10 files. This compares with 44 at AMD and 263 at Lucent — [Sadowski et al. 2018](https://sback.it/publications/icse2018seip.pdf)
- [MINING] (ABS) 793 Gerrit comments: 42% give a suggestion with no explanation. Explanations fall into seven types, including rule or principle and similar examples — [Widyasari et al.](https://arxiv.org/abs/2311.09020)

### Inferences
- An explanation should lead with rationale and "what and why", then give most of its added value on the four hard needs (consistency, breakage, behavior, completeness). Those are the items a reader cannot get from the diff.
- Churn and hot-spot history is low priority as a headline item, since engineers rated it least important.
- Most of the reader's hidden question is "is my understanding correct?". Stating explicit, checkable claims about the change (behavior before and after, assumed invariants) addresses that directly.
- Authors and owners need less orientation than non-owners. A collapsible context layer fits both readers better than one fixed depth.

### Gaps
- Nearly all of this evidence predates AI authorship. Whether the ranking of needs holds for code nobody typed is unmeasured. The missing rationale problem may be much worse there, since Tao's "rationale is easy" finding depends on an author who knows the reason.
- Exact Tao importance scores for each need were read from a figure and not all were extractable.

## 2. Does the order of reading changes matter?

### Takeaway
Position clearly shapes attention, and files shown late get less of it. Whether any specific "optimal" order improves comprehension is unproven: the one direct experiment was inconclusive. The defensible design rule is to put what matters where attention is highest and make the grouping explicit, not to claim a proven best sequence.

### Cited Findings
- [MINING] (FT) 219,476 PRs from 138 Java projects: later files receive fewer comments, even controlling for lines added, whether the file is a test, and commenters. The analysis was limited to PRs of 2-10 files (81% had 1-10). Correlation is weak (Spearman ρ = -0.152 in the first-commit analysis) — [Fregnan et al. FSE 2022](https://arxiv.org/abs/2208.04259)
- [EXP] (FT) 106 participants, of whom 72 were software developers, 5-file change with two seeded bugs and swapped positions. The Corner Case bug was found by 34 of 56 when first and 18 of 50 when last (OR 2.75). The Missing Break bug showed no significant position effect (OR 1.44). The first file was on screen 8.58 minutes on average and the last 6.09. 72.6% said position had no influence on them — [Fregnan et al. 2022](https://arxiv.org/abs/2208.04259)
- **Correction to circulating claim:** "64% lower odds" is an odds statistic. From the raw counts above, detection fell from about 61% to 36%, so about 41% fewer detections (my arithmetic from the paper's numbers). Later papers restate it as "64% less likely" ([Rahman et al. ICSE 2026](https://arxiv.org/pdf/2609.04207)) and "64% more likely" ([Rahman et al. 2026 preprint](https://arxiv.org/abs/2609.22610)). Neither wording is accurate. It also held for one of two defect types only.
- [EXP] (FT) 50 participants, mostly professionals. Testing predicted order rules on review efficiency: "Strong statistically significant conclusions cannot be drawn". Differences in medians went in the predicted direction with high variance. The authors still regard tooling for order as worth pursuing — [Baum et al. EMSE 2019](https://tobiasbaum.github.io/rp/memoryCodeOrderAndReview.pdf)
- [OPINION/THEORY] (FT, as restated in Baum 2019) Six ordering principles: (1) group related change parts closely, (2) provide information before it is needed, (3) prefer grouping when 1 and 2 conflict, (4) treat closely related parts as chunks, (5) the closest distance is "visible on screen at the same time", (6) use rules the reviewer can understand and make the grouping explicit — [Baum et al. 2019](https://tobiasbaum.github.io/rp/memoryCodeOrderAndReview.pdf)
- [EXP] (FT) Test-first review, 92 developers analyzed, more than 150 reviews. Same proportion of production bugs found. More test bugs found (0.40 vs 0.17). Fewer production maintainability issues found (0.08 vs 0.21 for production-first). Review time did not differ — [Spadini et al. ICSE 2019](https://sback.it/publications/icse2019a.pdf)
- [SURVEY] (FT) Of 103 respondents, 5% always start from tests, 13% almost always, 42% sometimes, 27% almost never, 13% never. Tests are seen as less important, and reviewers fear running out of energy before reaching production code — [Spadini et al. 2019](https://sback.it/publications/icse2019a.pdf)
- [SURVEY] (FT) 1,355 developers across 182 OSS projects. 42.4% follow the default alphabetical order and only 10.2% consider it optimal. Other strategies: importance or core first 27.5%, by module or feature 13.9%, file type 5.8%, size 3.7%, control flow 3.1%, dependency order 0.9%, risk 0.8%. About 66% favor customization — [Rahman et al. ICSE 2026](https://arxiv.org/pdf/2609.04207)
- **Inconsistency noted:** that paper's abstract says 57.6% report context switching and fatigue, but its RQ1 text uses 57.6% for "preferred alternative approaches", the complement of 42.4%. Treat the fatigue reading of that number with caution — [Rahman et al. ICSE 2026](https://arxiv.org/pdf/2609.04207)
- [MINING] (ABS) 330,343 multi-file PRs. Later involvement in bug-fixing rises only slightly with position, 56.7% at position 1 to 61.5% at position 30. The authors call the association modest. The proxy is broad ("file later touched by a bug-fix"), so this is not a defect-escape rate. Preprint — [Rahman et al. 2026](https://arxiv.org/abs/2609.22610)
- [MINING] (ABS) JetBrains, IntelliJ IDEA: position effect reproduced on a proprietary project. Ordering by code diff placed files needing more review effort higher than alphabetical order did. No numbers in the abstract — [Bagirov et al. EASE 2023](https://arxiv.org/abs/2306.06956)
- [QUAL] (FT) Experienced reviewers do not all read the same way. Linear reading fits small changes (shift reported around 176 changed lines). Larger changes get "easy-first" or "core-based" reading, the latter starting at the core and following data and execution flow. Some start with tests to see intent, others end with them — [Gonçalves et al. ICPC 2025](https://arxiv.org/abs/2503.21455)
- [EXP] (FT, as summarized in Baum 2019) Method-order study: grouping methods by call-flow tended to help understanding, but without statistical significance — [Baum et al. 2019](https://tobiasbaum.github.io/rp/memoryCodeOrderAndReview.pdf)

### Inferences
- Treat the first screen as the scarcest resource: put the highest-risk or central part first, not the first file alphabetically.
- Follow a story order (intent, core change, ripple effects, tests, mechanical edits) and label it, per principle 6. Offer one recommended path but let the reader jump, since reviewers' strategies differ.
- Keep related hunks on the same screen rather than linked. Principle 5 argues for this, and a generated HTML page has freedom a file-list tool lacks.
- Tests have a real trade-off, not a free win. Placing them first may raise test scrutiny while lowering attention to production maintainability. For AI-written code, a short "what the tests claim" summary near the top, with full tests later, is a reasonable hedge.
- Readers deny being affected by position (72.6%), so preference testing will not reveal this effect. Evaluation needs a task measure.

### Gaps
- No experiment tests a narrative order against file order on comprehension itself. Fregnan and Baum measured defect finding.
- Baum et al. 2017 (the original ordering paper) was not opened, and its principles are taken from the 2019 restatement.
- Whether the position effect persists in a guided, narrated page rather than a file list is unknown.

## 3. Tangled changes and decomposition: effect on understanding and review quality, and how an explanation should handle a tangled diff

### Takeaway
Tangling is common and developers hate it, but the measured benefit of decomposition is smaller than the folklore suggests: fewer false alarms and more context-seeking, not reliably more bugs found. The honest approach is for the explanation to name the concerns, attribute each hunk to one, and separate them visibly without claiming that this guarantees quality.

### Cited Findings
- [MINING] (FT) 453 changes from four OSS projects: 17% composite on average, up to 29% — [Tao & Kim MSR 2015](https://hunkim.cse.ust.hk/papers/tao-msr2015.pdf)
- [EXP] (FT) 18 CS students, within-subject, 12 small changes (38 changed lines on average). Partitioned changes yielded significantly more correct answers (p=0.01) with no significant time difference (p=0.81). The authors call it preliminary and warn it may not generalize to larger changes — [Tao & Kim 2015](https://hunkim.cse.ust.hk/papers/tao-msr2015.pdf)
- [EXP] (FT) 28 professionals and graduate students, on a system of about 3,000 lines. Untangled PRs led to fewer false positives (p=0.03, medium effect). Defects found, suggested improvements, time and rationale understanding did not differ significantly. Reviewers of untangled PRs opened more referenced classes and worked in a more structured way — [di Biase et al. PeerJ CS 2019](https://arxiv.org/abs/1805.10978)
- [SURVEY+QUAL] (FT) Mapping parts of a composite change to individual issues is "difficult and error-prone". Engineers asked for automatic decomposition into sub-changes that each address one issue — [Tao et al. 2012](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/07/howdosoftwareengineersunderstandcodechanges_fse2012.pdf)
- [QUAL] (FT, as summarized by di Biase) Barnett et al. reported a positive association between decomposition and understanding, and suggested it helps review time by separating contexts — [di Biase et al. 2019](https://arxiv.org/abs/1805.10978)
- [QUAL] (FT) All ten interviewees called multiple issues in one change unacceptable, but "not necessarily due to a reduced understanding": one cited cleaner history and easier reverts. They also said commits that cannot stand on their own make review harder. One advised to "make each commit self-contained" — [Ram et al. 2018](https://zenodo.org/records/1323659/files/preprint.pdf)
- [QUAL+SURVEY] (FT) Reviewability is defined as how well a change is (1) explained (description, commit history), (2) properly sized and self-contained, and (3) aligned with project style — [Ram et al. 2018](https://zenodo.org/records/1323659/files/preprint.pdf)
- [QUAL] (FT) "Splittable" is a recognized but least frequent reviewer need, and interviewees still wanted early automatic detection — [Pascarella et al. 2018](https://sback.it/publications/cscw2018.pdf)
- [QUAL] (FT) Reviewers chunk on their own by commit, functional area, file, issue, or previous comments, and sometimes finish with a linear read to check consistency — [Gonçalves et al. 2025](https://arxiv.org/abs/2503.21455)
- [EXP] (FT) Larger, more complex changes lower review effectiveness: 59% for small vs 35% for large, and 15.65 vs 9.47 defects per hour. These values depend on seeded defects, and the authors cannot tell overload from reduced motivation — [Baum et al. 2019](https://tobiasbaum.github.io/rp/memoryCodeOrderAndReview.pdf)

### Inferences
- Handle a tangled diff in two passes. First, a concern map: "this diff does 3 things", with each hunk assigned to a concern and shared hunks flagged. Second, one section per concern, in the order of importance.
- Say so plainly when a hunk cannot be cleanly assigned. An LLM-invented clean story is a risk here, since the 69% automatic partition accuracy in Tao & Kim shows that even targeted tools get about a third wrong.
- The reduced false positives finding suggests a useful side effect: when a reviewer knows which concern a hunk belongs to, fewer spurious comments follow. Separating refactor noise from behavior change is the highest value split, since di Biase's tangled material mixed refactoring and enhancement.
- Offer a closing cross-concern check, mirroring the reviewers' final linear read, so that interactions between concerns are not lost by the separation.
- Suggest splitting the PR as an explicit, optional outcome.

### Gaps
- Herzig & Zeller's tangled-change prevalence figures and Barnett et al. 2015 were not opened. Both are known only via citing papers.
- All experiments use small systems or small changes. Agent PRs can be much larger, and the evidence for decomposing them is absent.
- No study tests an explanation that re-sequences a tangled diff without changing its commits.

## 4. Cognitive load in review: checklists, strategies, size limits, attention decay, priming

### Takeaway
Larger reviews perform worse, and attention falls along a list, but "reduce load" is too simple. Guidance adds its own load, higher effort went with better performance in one study, and understanding of the code dominated. Well-known hard limits (200-400 LOC, 60 minutes) trace to vendor material and should be used as heuristics.

### Cited Findings
- [EXP] (SEC, Springer PDF redirected to login) Ad hoc vs checklist vs guided checklist. Task-dependent results: the guided checklist helped more on the simple review, and the plain checklist on the complex one. No strong relationship between guidance and performance. Checklists may lower load, yet higher cognitive load went with better performance, possibly reflecting generally low effectiveness among largely novice participants — [Gonçalves et al. EMSE 2022](https://rd.springer.com/content/pdf/10.1007%2Fs10664-022-10123-8.pdf)
- (SEC) A university news piece gives 70 participants — [Horizons](https://test.horizons-mag.ch/?p=8960). A commentator reads the study as showing guidance adds load, shorter lists work better, and understanding of the code was the largest factor — [Staron](https://metrics.blogg.gu.se/?p=747)
- [EXP] (FT) Working memory capacity correlates moderately with finding *delocalized* defects, and hardly at all with other defects. Review time was the strongest factor even there — [Baum et al. 2019](https://tobiasbaum.github.io/rp/memoryCodeOrderAndReview.pdf)
- [EXP] (FT) Participants spent less time on the last review, which the authors treat as a likely effect of a difficult task. They also doubt that cognitive load is yet a sharp enough construct, calling its definitions fuzzy — [Baum et al. 2019](https://tobiasbaum.github.io/rp/memoryCodeOrderAndReview.pdf)
- [MINING] (FT) 1.5M comments, five Microsoft projects. As file count rises, the share of useful comments drops. 83% of comments occur in the first two iterations, and later ones are less likely to be useful — [Bosu et al. MSR 2015](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/bosu2015useful.pdf)
- [MINING] (ABS) Each additional modified file reduces the odds that a file gets any review comment by about 8.7%. Very small and very large PRs showed elevated later bug-fix involvement, with the minimum near ten files. Preprint — [Rahman et al. 2026](https://arxiv.org/abs/2609.22610)
- [OPINION/VENDOR] (FT) 200-400 LOC per review, under 500 LOC per hour, no more than 60 minutes per sitting. The page cites a SmartBear study of a Cisco team but gives no sample or method, and the 60-minute and 70-90% claims have no stated source. It also sells a review tool — [SmartBear](https://smartbear.com/learn/code-review/best-practices-for-peer-code-review/)
- [QUAL] (FT) "The longer you are reviewing, the more sloppy you get" — survey participant, in [Spadini et al. 2019](https://sback.it/publications/icse2019a.pdf)
- [EXP] (FT) Priming: 85 developers. 70% were prone to availability bias in a separate psychological test, yet for three of four bugs a visible prior comment changed nothing. For one uncommon bug type (a null-pointer check), a prior comment raised detection of a second instance without hurting detection of other bugs. The authors conclude that comments act as "positive reminders" — [Spadini et al. ICSE 2020](https://sback.it/publications/icse2020.pdf)
- [EXP] (FT) In contrast, a full automated review anchors: reviewers mostly stayed at the locations the LLM pointed to and accepted 89% of its issues. See section 8 — [Tufano et al. ICSE 2025](https://arxiv.org/abs/2411.11401)
- [QUAL] (FT) Reviewers also manage scope deliberately: full, focused, partial, or shallow reviews. The authors suggest letting reviewers toggle existing comments to reduce bias — [Gonçalves et al. 2025](https://arxiv.org/abs/2503.21455)

### Inferences
- A generated explanation is itself a load, and should be judged like a checklist: short, specific to this diff, and removable. Long generic explanations fall on the wrong side of the Gonçalves result.
- Prefer risk-specific prompts ("check that X still holds in Y") over generic lists. Spadini 2020 suggests that pointing to uncommon failure types helps, because reviewers otherwise overlook them.
- The gap between Spadini 2020 (a single focused reminder is benign) and Tufano 2025 (a complete review anchors) suggests a line for product design: a few pointed questions, not an exhaustive verdict. This is my inference, as no study compares them directly.
- Use size cues to change format. Linear reading gives way around 176 changed lines in Gonçalves et al. (ten reviewers, so a rough marker only). Beyond that range, the document should switch to chunked structure and declare what is summarized rather than shown.
- Show scope honestly ("this page covers 4 of 40 files in detail") so the reader can pick a deliberate scope rather than drift into shallow review.

### Gaps
- No primary 2006 SmartBear/Cisco data was opened. The 60-minute limit in particular has no solid source in what I read.
- Direct measurement of attention decay within a review (as opposed to position effects) was not found.
- Full numbers for Gonçalves 2022 were not accessible. The study should be read before being cited for effect sizes.

## 5. Knowledge transfer and bus factor: does review spread knowledge, and how could it be measured?

### Takeaway
Review exposes people to code, and exposure is measurable. That it produces lasting understanding is mostly assumed. The one study that tried to detect learning from review in outcomes found nothing, and reachability models give an upper bound, not learning. Comprehension checks of the kind used in AI skill studies are the closest available measurement.

### Cited Findings
- [MINING] (FT) Review raises the distinct files a developer "knows about" by 66-150% depending on the project. Median Chrome developer: 24 files submitted, 38 reviewed, 43 in total, and 44% fewer without review. "Knows about" means touched in a review. The authors call the measure preliminary — [Rigby & Bird FSE 2013](https://users.encs.concordia.ca/~pcr/paper/Rigby2013FSE.pdf)
- [MINING] (FT) Google: developers in their first year get more than twice as many comments per change, and comments decline with tenure, which the authors read as reviewers needing to ask fewer questions. Files edited or reviewed increase with seniority — [Sadowski et al. 2018](https://sback.it/publications/icse2018seip.pdf)
- [MINING] (FT) Negative result: 32,062 reviewed PRs, 728 developers, 4,981 repositories. More past reviewed PRs did not show the expected quality gains in proxies such as acceptance, comments received and sentiment. Authors stress this does not contradict qualitative evidence and may reflect their proxies — [Caulo et al. ICPC 2020](https://www.inf.usi.ch/faculty/lanza/PUBS/P/Caul2020a.pdf)
- [SIMULATION] (ABS) An in-silico upper bound: at Spotify and Trivago sizes, a participant could reach 72-85% of others within four weeks, Microsoft had a bound of about 11,000 participants, and the median path was under five hops and five days. This is what *could* spread, not what did — [Dorner et al. EMSE 2025](https://arxiv.org/abs/2306.08980)
- [MINING+SIMULATION] (ABS) Review naturally reduces files at risk from turnover. Simulated reviewer recommendation that routes files known to one person to others gave 28% fewer files at risk, 12% less workload concentration, and 3% more expertise — [Hajari et al.](https://arxiv.org/abs/2312.17236)
- [SURVEY] (FT) Knowledge transfer was the first motivation for 8%, second for 14%, third for 16% of 873 Microsoft programmers — [Bacchelli & Bird 2013](https://web.eecs.umich.edu/~weimerw/2018-481/readings/codereview.pdf)
- [QUAL] (SEC) Design rationale is stated explicitly in code reviews, but retaining that knowledge is a problem — [Sutherland & Venolia 2009](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/ICSE2009_NEIR_0569_Sutherland_Andrew.pdf)
- [SURVEY] (FT) Beko, AI review bot, general survey of 22 respondents: 9 reported no effect on knowledge sharing, 8 a positive one — [Cihan et al. ICSE-SEIP 2025](https://arxiv.org/html/2412.18531v2)
- [MINING] (FT) 278,790 review conversations: over 95% of AI comments are code improvement or defect detection, and humans provide more Understanding, Testing and Knowledge Transfer feedback. Preprint — [Zhong et al. 2026](https://arxiv.org/html/2603.15911v1)
- [OPINION] (FT) Proposed proxies for understanding loss: onboarding time, knowledge concentration, resistance to change, unexpected results after changes. All unvalidated — [Storey 2026](https://arxiv.org/pdf/2603.22106)
- [QUAL] (FT) Proposed indicators such as explanation latency and modification difficulty, explicitly not validated — [Ahmad EASE 2026](https://arxiv.org/html/2604.13277)

### Inferences
- If AI review replaces humans, the review conversation that carried rationale shrinks. Atlassian's 35.6% drop in human comments (section 8) may therefore be a knowledge cost as well as a saving. This is my inference, as the paper reports it as lower workload.
- A diff explanation in a personal library doubles as a durable rationale record, which addresses the retention problem directly.
- Measurable options for the product, roughly in order of validity: a short comprehension check on debugging and behavior questions (the construct used by Shen & Tamkin), a later retention check, then behavioral proxies. Page views measure exposure, which is the same weakness as Rigby & Bird's measure.

### Gaps
- I found no study that measures mental-model change from code review directly.
- Bus-factor prevalence figures were not verified, since the search budget ran out. Hajari is the only quantified link between review and turnover risk here.
- No study compares reading an explanation with reviewing a diff in terms of knowledge transfer.

## 6. Program comprehension models: top-down vs bottom-up, beacons, information foraging, mental-model formation

### Takeaway
Reviewers build a three-part mental model (goals, implementation, and links between them) by mixing top-down and bottom-up moves opportunistically. The newest review-specific work confirms a two-stage shape: orientation first, analysis second. An explanation should therefore supply the goals and the links explicitly, leaving implementation reading to the reader.

### Cited Findings
- [QUAL] (FT) Ten experienced reviewers, 25 real reviews, think-aloud, extending Letovsky's model. Stages: context building, then inspection (code reading, testing, and discussion management, potentially in parallel), then decision. Mental model layers: *specification* (goals and reasons), *implementation* (what changed), *annotation* (links between goal and code) — [Gonçalves et al. ICPC 2025](https://arxiv.org/abs/2503.21455)
- [QUAL] (FT) Top-down annotation relies on traceability across issues, PR text and naming. Bottom-up annotation starts from code behavior and assigns purpose. Both run in parallel — [Gonçalves et al. 2025](https://arxiv.org/abs/2503.21455)
- [QUAL] (FT) Reviewers compare the change with an *expected* model (from pre-alignment or earlier rounds) and an *ideal* model (their view of a better solution), and do not always pursue the ideal. Pre-alignment reduces context-building effort — [Gonçalves et al. 2025](https://arxiv.org/abs/2503.21455)
- [QUAL] (FT) Sources actually used: PR title and description in 21 of 25 reviews, issue tracker 11, PR discussion 10, other PRs in about 20% of sessions, and external resources including ChatGPT — [Gonçalves et al. 2025](https://arxiv.org/abs/2503.21455)
- [QUAL] (FT) Comprehension theory background as given there: developers start top-down for the big picture, move to detail, and combine approaches opportunistically, citing Letovsky and Lawrance et al. The paper does not apply information foraging to review or discuss beacons — [Gonçalves et al. 2025](https://arxiv.org/abs/2503.21455)
- [QUAL] (ABS) Ten participants, 34 reviews, think-aloud. Reviewing resembles recognition-primed decision-making: an orientation phase that establishes context and rationale, then an analytical phase to understand, assess and plan. Decisions on commenting, seeking information, and running code recur throughout — [Heander et al. 2025](https://arxiv.org/abs/2507.09637)
- [QUAL] (FT) Reviewers with less context start from the description, while owners start from known files — [Bacchelli & Bird 2013](https://web.eecs.umich.edu/~weimerw/2018-481/readings/codereview.pdf)
- [THEORY] (FT) A good order helps by "off-loading" from reviewer to tool in a joint cognitive system, avoiding speculative assumptions and easing the spotting of inconsistencies — [Baum et al. 2019, quoting Baum et al. 2017](https://tobiasbaum.github.io/rp/memoryCodeOrderAndReview.pdf)
- [OPINION] (FT) A program is a "theory" held by its team (Naur). AI use can sever the problem-solution feedback loop that builds that theory — [Storey 2026](https://arxiv.org/pdf/2603.22106)
- [QUAL] (FT) The authors warn that experiments using small artificial changes miss scoping and chunking behaviors seen in real review, which qualifies the experiments cited in sections 2 to 4 — [Gonçalves et al. 2025](https://arxiv.org/abs/2503.21455)

### Inferences
- Map document structure directly to the three layers: specification ("what this is for"), annotation (a goal-to-code map with links into hunks), implementation (annotated diffs). The annotation layer is what a diff lacks and is what top-down readers need most.
- Write the goal statement before showing code, so the reader can form an expected model and then check it. The explanation should be the place where expected and actual diverge visibly.
- Honest surfacing of "alternatives considered and rejected" serves the ideal-model comparison, and it matches Pascarella's top need.
- Link every claim to a hunk so that bottom-up verification costs one click. This keeps both navigation modes alive.

### Gaps
- Primary classics were not opened in this session: Brooks 1983, Soloway & Ehrlich, Wiedenbeck on beacons, Pennington, von Mayrhauser & Vans, Storey 2005, Lawrance et al. on information foraging. The search budget ran out. Any specific claim about beacons or foraging needs separate verification, and I report none here.
- I found no empirical application of information foraging theory to diff review.

## 7. AI-specific evidence, 2024-2026: comprehension and cognitive debt, skills, reviewing AI code, authors who did not write the code

### Takeaway
There is one good RCT on learning (Shen & Tamkin) showing that AI use lowered comprehension when it replaced effort, with engagement as the moderator. It has a narrow scope. "Cognitive debt" is a useful concept with thin direct evidence. I found no controlled study of reviewers or authors comprehending agent-written PRs. The most robust cross-study signal is a gap between perceived and actual state.

### Cited Findings

**Skill formation and comprehension**
- [EXP] (FT) 52 mostly junior engineers learning the Trio library, 35-minute task, 25-minute quiz, preregistered. AI group scored 50% vs 67% (d=0.738, p=0.010). Task time did not differ significantly (p=0.391). Preprint. The assistant was GPT-4o in a chat panel, not an agent — [Shen & Tamkin 2026](https://arxiv.org/abs/2601.20245); [Anthropic summary](https://www.anthropic.com/research/AI-assistance-coding-skills)
- **Correction to circulating claim:** "17% lower" is 17 percentage points, or about 25% relative to the control mean. Anthropic's page also gives about 65% for the control in its figure versus 67% in the text — [Anthropic](https://www.anthropic.com/research/AI-assistance-coding-skills)
- [EXP, exploratory] (FT) Largest gap on debugging questions and smallest on code reading. This breakdown was not preregistered. The authors suggest the control group got better at debugging by hitting more errors — [Shen & Tamkin 2026](https://arxiv.org/abs/2601.20245)
- [QUAL within EXP] (FT) Interaction patterns, n=24 in total and associational only: delegation 39%, progressive reliance 35%, iterative AI debugging 24%, versus generation-then-comprehension 86% (n=2), hybrid code-explanation 68% (n=3), conceptual inquiry 65% (n=7). Typing out AI code by hand gave no notable quiz benefit over pasting, so cognitive effort rather than raw time looks important — [Shen & Tamkin 2026](https://arxiv.org/abs/2601.20245)
- Authors' stated limits: short-term measure, no long-run data, small sample, no human-assistance comparison. They expect larger effects with agentic tools, which is a hypothesis, not a finding — [Anthropic](https://www.anthropic.com/research/AI-assistance-coding-skills)
- [EXP] (ABS) 55 undergraduates, C tasks, ChatGPT vs web search. Performance 89% vs 69%, cued recall 41% vs 53% immediately and 39% vs 52% at 48 hours, attributing 45% vs 81% of code to themselves. Rate of recall loss did not differ (my reading: weaker initial encoding rather than faster forgetting). Preprint — [Bergh et al. 2026](https://arxiv.org/abs/2609.21194)

**Cognitive and comprehension debt**
- [OPINION] (FT) Triple debt model: technical debt lives in code, cognitive debt in people, intent debt in artifacts. The motivating evidence is a student team anecdote plus citations. Measurement is explicitly open. "Cognitive debt" is defined at team level, distinct from cognitive load — [Storey 2026](https://arxiv.org/pdf/2603.22106); [blog](https://margaretstorey.com/blog/2026/02/09/cognitive-debt/)
- [OPINION] (FT) Directly relevant warning: "Resist the automation of understanding". AI-generated explanations can substitute "the appearance of understanding for the real thing" and make cognitive debt harder to detect. She also recommends "system walkthroughs where developers explain code they did not write" and treating understanding as a deliverable — [Storey 2026](https://arxiv.org/pdf/2603.22106)
- [QUAL] (FT) 621 diary entries from 207 undergraduates, single course. Four accumulation patterns: black-box acceptance, context mismatch, comprehension atrophy, verification bypass. One protective pattern: using AI as a comprehension scaffold by asking for explanations and rewriting. Self-reports only, and not triangulated — [Ahmad EASE 2026](https://arxiv.org/html/2604.13277)
- [OPINION] (FT) "Comprehension debt" as a popular framing. Its evidence reduces to Shen & Tamkin plus anecdotes, and one figure it gives has no source. Do not cite it as evidence — [Osmani](https://addyosmani.com/blog/comprehension-debt/)

**Perception vs reality**
- [EXP] (FT) METR 2025: 16 experienced OSS developers, 246 tasks. AI allowed: 19% longer (95% CI +2% to +39%). They forecast 24% faster, and believed afterward they were 20% faster — [METR 2025](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/); [CI in update](https://metr.org/blog/2026-02-24-uplift-update/)
- **Update:** METR's follow-up gives -18% task time (CI -38% to +9%) for returning developers and -4% (CI -15% to +9%) for new ones, and calls this an unreliable, likely lower-bound signal because of selection: 30-50% withheld tasks they would not do without AI. METR now says the early-2025 result does not reflect current impact — [METR Feb 2026](https://metr.org/blog/2026-02-24-uplift-update/). Cite the 19% only as a dated result, and the perception gap as the durable point.
- [EXP] (ABS) AI-assisted participants wrote less secure code and were more likely to believe it secure. Those who trusted the AI less and worked harder on prompts did better — [Perry et al. CCS 2023](https://arxiv.org/abs/2211.03622)
- [OPINION, citing Shaw & Nave 2026] (FT, Storey only) "Cognitive surrender" reportedly inflates confidence even when AI is wrong. The primary was not opened — [Storey 2026](https://arxiv.org/pdf/2603.22106)

**Reviewing AI code vs human code**
- [Blinded rating study] (FT) 4 maintainers, blinded to authorship, reviewed 296 agent PRs that passed SWE-bench. Merge rates were about 24 pp below grader scores (normalized), and about half of passing patches would not be merged. Reasons were mainly quality and conventions, plus breaking other code and core failures. No CI, one attempt, models through Claude 4.5 Sonnet and GPT-5. Not a capability limit, per METR — [METR March 2026](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/)
- [MINING] (FT) 278,790 conversations in 300 projects: human reviews of AI code involve 11.8% more rounds than reviews of human code. Preprint, mature OSS only — [Zhong et al. 2026](https://arxiv.org/html/2603.15911v1)
- [EXP, small] (ABS) 21 participants: eye tracking showed less visual attention on model-generated code. Early Copilot (2022) — [Al Madi 2022](https://arxiv.org/abs/2208.14613)
- [EXP] (ABS) 28 participants: developers often fail to identify LLM origin unaided. Those told the provenance performed better, searched more, and reported higher workload — [Tang et al. 2024](https://arxiv.org/abs/2405.16081)
- [MINING] (ABS) AIDev: 456,000+ agent PRs across 61,000 repositories. Agents are faster but accepted less often. One developer submitted as many PRs in three days as in the previous three years — [Li et al. 2025](https://arxiv.org/abs/2507.15003)
- [MINING] (ABS) 7,156 AIDev PRs: acceptance varies by task (documentation 82.1%, features 66.1%). Acceptance figures across studies are subset dependent, so no single rate should be quoted — [Pinna et al. MSR 2026](https://arxiv.org/abs/2602.08915)
- [QUASI] (ABS) Cursor adoption: temporary velocity increase, persistent rise in static-analysis warnings and complexity, with quality increases contributing to later slowdown — [He et al. MSR 2026](https://arxiv.org/abs/2511.04427)
- [EXP] (FT, partial) Counter-evidence on maintainability: 151 participants (95% professionals). Phase 1 observational, 30.7% median time reduction. Phase 2 RCT, 75 new developers evolved that code without AI, no significant difference in time or CodeHealth. Underpowered for small effects (0.17 power at d=0.2). Authors flag cognitive debt only as future work — [Borg et al. EMSE 2026](https://arxiv.org/html/2507.00788v3)

**Authors who did not write the code**
- [EXP] (ABS) Within-subjects, three AI autonomy levels. Sense of possession falls as AI contributes more, identity drops at high autonomy, felt responsibility falls but persists. Developers become less willing to claim ownership when speaking to technical reviewers, while willingness to accept accountability for production stays constant. Sample size not visible to me — [Seo et al. IUI 2026](https://researchdiscovery.drexel.edu/esploro/outputs/conferenceProceeding/Whose-Code-Is-It-How-AI/991022166402204721)
- [QUAL] (SEC) Accountability in peer review shifts from individual to collective, and "one cannot be accountable to an LLM" — [Alami, Jensen & Ernst, TOSEM 2025](https://www.arxiv.org/abs/2502.15963)

### Inferences
- The strongest product implication: engagement moderates harm. Generation-then-comprehension resembles exactly what this tool enables, but it rests on n=2 and n=3 cells, and the same study suggests passive consumption would not help. An explanation that is only read may produce comfort rather than comprehension. It should require retrieval: predictions, questions, or a "what would break if" check.
- Debugging was the largest gap and is the skill needed to supervise AI. Explanations should exercise failure reasoning rather than describing the happy path.
- Storey's warning is a design requirement, not just a caveat. The document should present itself as a guide to the code, with checkable claims, and never as a substitute for reading it.
- Authors of AI code are a distinct reader. They may be less able to defend the change, and less willing to claim it. A pre-review "can you explain this?" mode for authors follows from Seo et al. and from Storey's walkthrough idea, though no study evaluates it.
- Always show provenance. Tang et al. suggests that knowing about it improves performance at the cost of more effort.
- Beware of asserting that AI code is worse. Borg et al. found no maintainability penalty over short tasks. The better supported statement is that AI code passes automated checks more easily than it satisfies maintainers, and that people feel more confident than they should.

### Gaps
- **Central gap:** no controlled experiment compares comprehension or defect detection when reviewing AI-written vs human-written PRs with disclosed authorship. METR's is blinded and concerns merge decisions.
- No study tests whether a PR author can explain or defend agent-written code.
- No longitudinal comprehension data exists. Storey reportedly has cohort data from 2022 onward, but only via press coverage.
- A figure of 58.2% of agentic PRs receiving no explicit review appeared in an aggregator. I could not verify it and it should not be used.
- Term origins are unclear: Storey attributes "comprehension debt" to Alakmeh et al. 2026 (not found by search), and a search summary credits Jason Gorman 2025 (unverified).
- Results on agents are scarce. Shen & Tamkin, Perry, and Al Madi all studied chat or completion tools, and generalization to Claude Code-style agents is unproven in either direction.

## 8. Reviewers' experience of LLM summaries and AI review comments: acceptance and usefulness

### Takeaway
Reported acceptance varies by an order of magnitude (about 7% to 74%) because metrics differ, and cycle-time results point in both directions. The one controlled experiment found AI review anchored reviewers and saved no time. Summaries get the most consistent subjective praise, but I found no study measuring whether they improve comprehension. Meta's randomized result is the key design lesson: an AI artifact shown to reviewers creates a vetting cost.

### Cited Findings

**Controlled**
- [EXP] (FT) 29 developers, 72 reviews, ChatGPT Plus (GPT-4). 89% of LLM-flagged issues were kept. Reviewers focused on locations the LLM pointed to. Injected-issue detection was unchanged (median 50% both ways), with more low-severity issues only. Reviews were longer (mean 27.79 vs 16.3 sentences). No time saved, as verification consumed it. Confidence unchanged — [Tufano et al. ICSE 2025](https://arxiv.org/abs/2411.11401)
- [EXP, randomized in production] (FT) Meta, tens of thousands of engineers. Showing AI patches to reviewers *and* authors raised TimeInReview 5.5% (p=.029) and TimeSpent 6.7%, and the rollout was reverted. Reviewers said they felt compelled to vet the patches. With patches collapsed for reviewers, the regression vanished (+0.42%, p=.86) and author acceptance held (10.53% vs 10.71%). The authors conclude that the burden of fixing should stay with authors. Vendor; FSE 2026 industry — [Meta MetaMateCR, arXiv 2507.13499](https://arxiv.org/html/2507.13499v1)

**Field and quasi-experimental**
- [QUASI] (FT, via HTML) GitHub Copilot for PRs: 18,256 AI-described PRs in 146 repos vs 54,188 without. Review time fell 19.3 hours on average (ATT). Merge OR 1.57 (84% vs 71% raw). Early adopters and unmeasured confounding are limits. Of 730 filtered PRs, 311 were edited by humans, who most often added template content, links, *intent* (12.8%) and *testing information* (9.2%) — [Xiao et al. FSE 2024](https://arxiv.org/abs/2402.08967)
- [FIELD] (FT) Beko, Qodo PR Agent with GPT-4: 73.8% of comments resolved, yet closure time rose from 5h52 to 8h20, varying by project (one fell from 6h06 to 3h07). Human comments per PR unchanged overall. Comment rating 3.46/5. Small survey. The fetched analysis found internal inconsistencies in the paper's discussion and conclusion figures, so use the results section only — [Cihan et al. ICSE-SEIP 2025](https://arxiv.org/html/2412.18531v2)
- [FIELD] (ABS, SEC) Atlassian, one year, 1,900+ repos, 54,000+ comments: 38.70% code resolution (44.45% for human comments), 30.8% shorter median cycle time, 35.6% fewer human comments. Vendor and observational. The paper itself calls for A/B tests to isolate causality — [Tantithamthavorn et al. ICSE-SEIP 2026](https://arxiv.org/abs/2601.01129v2)
- [FIELD] (ABS) Mozilla and Ubisoft, 587+ reviews, RevMate: 8.1% and 7.2% of generated comments accepted, another 14.6% and 20.5% valued but not used. Refactoring comments accepted at about 18% vs about 5% for functional ones. Median +43 seconds per patch — [Olewicki et al. 2024](https://arxiv.org/abs/2411.07091)
- [FIELD] (ABS) ByteDance BitsAI-CR: 75.0% precision, 26.7% Outdated Rate for Go, 12,000+ weekly users. Vendor — [Sun et al. 2025](https://arxiv.org/abs/2501.15134)
- [FIELD] (ABS) Google: authors address 7.5% of reviewer comments by applying an ML-suggested edit — [Google abstract](https://research.google/pubs/resolving-code-review-comments-with-machine-learning/). The ICSE listing says "almost 5%", likely 10% with a new version — [ICSE 2024 listing](https://conf.researchr.org/details/icse-2024/icse-2024-software-engineering-in-practice/35/Resolving-Code-Review-Comments-with-Machine-Learning). The gap is unexplained and probably reflects versions.
- [FIELD] (ABS) Google AutoCommenter: deployed to tens of thousands of developers, reported as a positive effect, no numbers in the abstract — [Vijayvergiya et al. 2024](https://arxiv.org/abs/2405.13565)
- [FIELD/VENDOR] (FT) Microsoft: over 90% of PRs, 600K+ per month. "10-20% median PR completion time improvements" across 5,000 repos with no method disclosed. Includes PR summaries that reviewers call "extremely useful", quoted without data — [Microsoft blog 2025](https://devblogs.microsoft.com/engineering-at-microsoft/enhancing-code-quality-at-scale-with-ai-powered-code-reviews/)
- [MINING] (FT) AI suggestions adopted at 16.6% vs 56.5% for humans. Of unadopted AI suggestions, 28.7% were incorrect and 24.0% replaced by another fix. AI comments averaged 29.6 tokens per line of code vs 4.1 for humans. Adopted suggestions raised complexity. In 85-87% of AI-initiated reviews, the conversation ended after the first comment. Preprint — [Zhong et al. 2026](https://arxiv.org/html/2603.15911v1)

**Reviewer experience**
- [QUAL] (FT) 20 engineers: LLM reviews were emotionally easier but cognitively harder, since length and detail cost more effort than direct peer feedback. They weigh both kinds in similar ways, but worry about trust and missing codebase context — [Alami & Ernst 2025](https://arxiv.org/html/2501.02092v1)
- [FIELD/QUAL] (ABS) WirelessCar: developers overall preferred upfront AI-led review to on-demand, conditional on familiarity with the codebase and PR severity. False positives and trust were concerns — [Aðalsteinsson et al. ESEM 2025](https://conf.researchr.org/details/esem-2025/esem-2025-industrial-track-/3/Rethinking-Code-Review-Workflows-with-LLM-Assistance-An-Empirical-Study)
- [QUAL] (ABS) Seven participants preferred simple non-contextual link summaries over contextual ones that scored better on metrics, suggesting metrics and perceived usefulness diverge — [AILinkPreviewer 2025](https://arxiv.org/abs/2511.09223v1)
- [SURVEY] (FT) Beko respondents mention out-of-scope comments, mistakes and fear of over-reliance — [Cihan et al. 2025](https://arxiv.org/html/2412.18531v2)

### Inferences
- "Acceptance" is not a comparable metric across these papers: resolved, applied, adopted in a later commit, and judged valuable all differ. Do not present a single number. Reasoning from resolution rates to usefulness also ignores anchoring.
- Cycle time is not comprehension. A shorter time-to-merge may reflect faster understanding or lighter scrutiny, and no paper here distinguishes the two. The product should not use it as a success metric.
- Keep the AI artifact from becoming a thing to audit. Meta's result suggests that a reviewer who must vet the explanation pays extra. Layering (short and checkable first, collapsed detail) and author-first flows reduce that cost. Traceable claims help, because they make vetting cheap.
- The humans' most common edits to AI PR descriptions were to add intent and testing notes, which are what the diff alone cannot provide. A skill that has access to the session's reasoning can supply these, and should be explicit about where it inferred them.
- Conciseness is likely a real constraint: Zhong's ratio (29.6 vs 4.1 tokens per LOC) and Alami & Ernst's effort finding both point the same way.
- Explanations should attempt to counter anchoring by also naming what was not examined. See section 9.

### Gaps
- **No controlled study measures whether LLM change summaries improve reviewers' comprehension.** The closest evidence is Xiao's quasi-experiment on review time and Tufano's on detection.
- No field data on interactive explanations of diffs was found. All evidence concerns text summaries or inline comments.
- Meta's experiment concerns patches, not explanations, so transferring it is an analogy.
- Sample sizes for the WirelessCar study could not be confirmed from the program page. One secondary summary said ten developers.

## 9. What specifically is hard to see in a diff?

### Takeaway
A diff shows local text edits. Understanding requires what it omits: behavior over time, invariants, absent changes, far-away effects, and whether tests really cover the change. Direct evidence is strong for consistency, breakage, behavior and delocalized defects. It is thin or absent for deleted code as such.

### Cited Findings
- **Behavior:** [SURVEY] (FT) "How does this change alter the program's dynamic behavior?" is the third hardest need, and answering it needs semantic or behavioral differencing rather than text differencing — [Tao et al. 2012](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/07/howdosoftwareengineersunderstandcodechanges_fse2012.pdf)
- **What was not changed:** [SURVEY] (FT) "Are there any other places that need similar changes?" is the hardest need, and "is this change complete? Did it miss any place?" is fourth. Answering these needs logical and evolutionary coupling data not directly available in review tools — [Tao et al. 2012](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/07/howdosoftwareengineersunderstandcodechanges_fse2012.pdf)
- **Cross-file effects:** [SURVEY] (FT) "Does this change break any code elsewhere?" is both very important and hard. Code review is seen as human-intensive and error-prone, and reviewers lack IDE navigation such as find-references in review tools — [Tao et al. 2012](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/07/howdosoftwareengineersunderstandcodechanges_fse2012.pdf)
- **Delocalization:** [EXP] (FT) Delocalized defects can only be found, or are found much more easily, by combining knowledge from several code locations (Dunsmore). They are the defect type linked to working memory, which means they tax reviewers most — [Baum et al. 2019](https://tobiasbaum.github.io/rp/memoryCodeOrderAndReview.pdf)
- **Usage context:** [MINING] (FT) Reviewers need to know how declared or modified methods and variables are used — [Pascarella et al. 2018](https://sback.it/publications/cscw2018.pdf)
- **Invariants and impact:** [SURVEY] (FT) Respondents explicitly cite learning "purpose, invariants, APIs" and say "big-picture impact analysis requires contextual understanding", and that a small unfamiliar change can require reading far more code than the change itself — [Bacchelli & Bird 2013](https://web.eecs.umich.edu/~weimerw/2018-481/readings/codereview.pdf)
- **What review catches instead:** [SURVEY/MINING] (FT) Defect comments are 14%, mostly low-level logic (65 of 78), with 6 high-level and 5 security issues. Comments on code improvements are twice as common. Depth of understanding appears to be the bottleneck — [Bacchelli & Bird 2013](https://web.eecs.umich.edu/~weimerw/2018-481/readings/codereview.pdf)
- **Test adequacy:** [SURVEY] (FT) Testing as a risk check "heavily depends on the capability of the existing test cases to cover the change" — [Tao et al. 2012](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/07/howdosoftwareengineersunderstandcodechanges_fse2012.pdf)
- [QUAL] (FT) Nine of ten interviewees treated tests as a quick presence and coverage check rather than reading them closely — [Ram et al. 2018](https://zenodo.org/records/1323659/files/preprint.pdf)
- [MINING] (FT) Test files receive fewer review comments — [Fregnan et al. 2022](https://arxiv.org/abs/2208.04259)
- [QUAL] (FT) Poor test quality is a stated reason not to start from tests, since tests must properly exercise production behavior to be informative — [Spadini et al. 2019](https://sback.it/publications/icse2019a.pdf)
- [EXP] (FT) Passing automated tests is well short of being mergeable: maintainers rejected about half of the grader-passing AI patches, sometimes because of broken code or unsolved core problems — [METR March 2026](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/)
- [OPINION] (FT) "Tests may pass, but the product may have the wrong behavior" — [Storey 2026](https://arxiv.org/pdf/2603.22106)
- **Non-code files:** [MINING] (FT) Changes including config or build files elicit less useful comments — [Bosu et al. 2015](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/bosu2015useful.pdf)
- **Necessity:** [QUAL] (FT) Reviewers also ask whether a part of the change is really needed or could be simplified or removed, for example code that looks like a duplicate — [Pascarella et al. 2018, need N5](https://sback.it/publications/cscw2018.pdf)
- **Omitted intent in AI work:** [OPINION] (FT) Before AI, code carried intent via naming and design, and generated code may need intent captured deliberately — [Storey 2026](https://arxiv.org/pdf/2603.22106)

### Inferences
Proposed skeleton, derived from sections 1-9. Each element is an inference, not a tested format:
1. **Intent and provenance:** why this exists, who or what wrote it, what prompted it, and which parts of the "why" are inferred. (Sections 1, 6, 7)
2. **Concern map:** N concerns with hunks assigned, tangling stated, mechanical edits set aside. (Section 3)
3. **Behavior delta:** before and after in concrete terms, with an example input where possible. (Sections 1, 9)
4. **Core change first:** a guided path in a labeled order, related hunks on one screen. (Sections 2, 6)
5. **Reach:** callers and dependents, sibling sites that were and were not changed, and invariants relied on, each with evidence links. (Section 9)
6. **What was not checked:** explicit list of unexamined files and residual risks, and what tests do and do not cover. (Sections 4, 8, 9)
7. **Active check:** a few prediction or "what breaks if" questions before the answer is revealed. (Section 7)
8. **Decisions:** alternatives rejected, for the ideal-model comparison and as durable rationale. (Sections 5, 6)

Other design notes:
- Items 5 and 6 of the skeleton carry the unique value. Items 1 to 4 are orientation, and can be short.
- A negative statement such as "no other call sites need this" is a high value claim with high harm if wrong. It should cite how it was checked (for example the search performed) so that the reader can trust or re-run it.
- Static analysis can back up reach claims with data rather than LLM recollection, which addresses Tao's request for diff plus static analysis integration.
- Deletions may deserve explicit listing as behavior removed, since they do not appear as new logic to review, but this rests on reasoning and not on data.

### Gaps
- **Deleted code:** I found no empirical study on how reviewers treat deletions. This claim in the brief remains unverified either way.
- **Refactoring-aware and semantic diff evidence** was not opened, including work on separating moves from behavior changes.
- Dunsmore et al. were read only through Baum et al. Mäntylä & Lassenius (reported as 75% evolvability defects) were read only through later citations. Ebert et al. on confusion, Kononenko et al., Spadini et al. 2018 on reviewing tests, and Braz et al. on security review were not opened, because the search budget ran out before I could locate them.
- Effects of diff algorithm choice on perceived change were not examined.
- No study evaluates a section list like the one above. It would need a task-based test on comprehension, with a plain diff and a plain LLM summary as baselines.
