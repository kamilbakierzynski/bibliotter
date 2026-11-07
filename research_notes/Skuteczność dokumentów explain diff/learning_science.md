# Learning science for a single interactive explanation of a code change

Scope: one long-page interactive HTML explanation of a diff or PR, read once in 5-20 minutes by a working developer, usually the author or reviewer of the change, often of AI-written code. Produced by a Claude Code skill and viewed in the local Electron app html-docs-app.

Provenance tags on findings:
- **[O]** I read the relevant passage of the primary paper.
- **[A]** I saw only the abstract, a catalogue record or a search snippet of the paper.
- **[S]** The figure is reported by another paper, a press release or a blog. Treat it as second-hand.

Effect sizes from different meta-analyses are not directly comparable. Control conditions differ (no test, restudy, reading statements), and nearly all samples are students with little prior knowledge of the material.

## Which techniques should the document use? (ranking by evidence and by fit)

### Takeaway

The document's realistic job is not long-term memory. It is to make the reader understand now, and to show them what they did not understand. The best-fitting techniques are the ones that make readers generate an answer before seeing it, and the ones that cost the reader nothing: integrating code with explanation, cutting decorative material, and refuting likely misreadings. A five-question end quiz is the weakest form of the strongest technique, and spaced repetition is strong science with poor fit for change-specific knowledge.

### Cited Findings

Evidence strength and fit are rated separately. Evidence tier: A = several large meta-analyses and robust to moderators; B = a meta-analysis with real heterogeneity, or strong primary studies; C = thin, mixed or novice-only. "Transfer to pros" is my judgement of how far the evidence reaches working developers. The numbers are sourced in the sections below.

| Priority | Technique | Evidence | Key figure | Transfer to pros | Fit | Reader cost |
|---|---|---|---|---|---|---|
| 1 | Spatial contiguity: explanation next to the code | A | g = 0.63; d = 0.72 spatial | Probably good (load-based, not novice-specific) | High | None |
| 2 | Generate before reveal at 1-3 key behaviours (predict-observe-explain) | B | Crouch h = 0.18 on explanations; generated prequestions g = 0.65 | Unknown; plausible | High | 1-3 min |
| 3 | Refutation of the likely misreading | A | g = 0.36-0.41, no moderators, no backfire | Unknown; stable across K-12 to college | High | None |
| 4 | Coherence: cut decorative detail | A | g = 0.33 | Weaker for experts (g = 0.52 was for novices) | High | Negative (saves time) |
| 5 | Embedded checkpoints with explanatory feedback | A for testing; C for this placement | Monitoring gain 0.169 in correlation; feedback g = 0.73 vs 0.39 | Weak: physician RCTs null | High for calibration, modest for memory | 1-3 min |
| 6 | Prior-knowledge layering with a quick diagnostic | A for the effect; B for adaptation | d = +0.505 novice / -0.428 expert | Direct: effect strongest in higher education | High | Saves expert time |
| 7 | Contrasting cases (before vs after, the diff itself) | B | d = 0.50 | Unknown | High | Low |
| 8 | One self-explanation prompt | A | g = 0.55 | Students in professional programs g = 0.68, k = 4 | Medium (time) | 1-2 min |
| 9 | Signaling and segmenting | A / B | g = 0.33-0.53; g = 0.32-0.36 | Mixed: signaling r = -0.08 for high prior knowledge | Medium | None |
| 10 | Code tracing and plain-English questions | B (novices) | EiPE r = 0.555 with writing | Novice-only evidence | Medium-high as question formats | 1 min each |
| 11 | Worked trace of one concrete input | B (math) | g = 0.48 | Reverses with expertise | Medium | Low |
| 12 | End-of-document 5-question MCQ alone | A for testing; weak for this form | Recognition g = 0.29; single session g = 0.39 | Continuing education g = 0.31, not significant | Low-medium | 2-3 min |
| 13 | Spaced repetition of change details | A for spacing | Up to 111% recall gain, but needs days-long gaps | Yes, but not for this content | Low | High |
| 14 | Parsons problems | C | Same learning as writing, in less time | Novice-only | Low | Medium |
| Avoid | Deliberate disfluency | Disputed | d = 0.01 | n/a | None | n/a |

Findings behind the framing:
- Testing evidence is measured on later test performance, usually a day or more later, in learners new to the material; the testing effect is larger at retention intervals of 1 day or more (g = 0.69) than under 1 day (g = 0.41) — [Rowland 2014](https://courseware.epfl.ch/assets/courseware/v1/fdde2f0aa590bf3b1324077a6bf1540c/asset-v1%3AEPFL%2BDEMO%2B2020%2Btype%40asset%2Bblock/Rowland2014-meta-analysis.pdf) [O].
- Multimedia design principles matter more for complex material (g = 0.70) than simple material (g = 0.20), and more when system-paced (g = 0.41) than learner-paced (g = 0.27). A web page is learner-paced, so expect the smaller figure — [Noetel et al. 2022](https://doi.org/10.3102/00346543211052329), [PDF](https://files.constantcontact.com/1145f86e901/7bc63268-3738-46ae-9ee0-fbdafb58537f.pdf?rdr=true) [O].

### Inferences

- Treat the document as having three separable goals, and rank them in this order: (1) comprehension now, sufficient to approve, change or reject; (2) calibration, meaning the reader learns what they do not yet know; (3) retention. Most classic numbers concern (3), which is the least important goal here. Most fit for this format comes from (1) and (2).
- Priority should go to what costs the reader nothing and can be fully done by the generator: contiguity, coherence, refutation. These are skill-prompt changes, not new interaction code.
- The single interaction worth building first is a "commit, then reveal" component: a question or prediction, a forced answer or explicit "I don't know", and an explanation that covers every option. It serves prediction, prequestions, retrieval checkpoints and tracing with one piece of UI.
- Budget: at 5-20 minutes, 3-5 interactions total. This number is a judgement, not an evidence-derived optimum. The medical trials below suggest professionals are intolerant of test-like activity, so label these as checks on the change, not as a quiz of the reader.

### Gaps

- I found no study of any of these techniques on working software engineers reading explanations of code changes. Every "transfer to pros" rating above is an extrapolation.
- No study I found compares these techniques inside one document, so the priority order is a judgement that combines evidence and fit, not a measured league table.

## Retrieval practice: does a short end quiz help, and how should questions be built?

### Takeaway

Testing works, with g around 0.5 in classrooms, but the features of a one-off five-MCQ end quiz sit near the weak end of nearly every moderator, and the only professional RCTs are null. Keep questions, but move most of them into the reading, make them discriminate between real misreadings, and always give explanatory feedback. Justify them mainly by calibration, not memory.

### Cited Findings

Overall size:
- Testing vs restudy, lab-weighted: overall g = 0.50 — [Rowland 2014 as reported in Pan & Sana 2021](https://sc-pan.github.io/pdf/PS_2021.pdf) [O].
- Classroom: 222 studies, 48,478 students, g = 0.499. A positive effect appeared in most comparisons, and bias checks supported a real effect — [Yang et al. 2021](https://gwern.net/docs/spacedrepetition/2021-yang.pdf) [O]. Field evidence, but school and university students.
- Adesope et al. 2017 reported g = 0.61 across 272 effects, with classroom (0.67) and lab (0.62) similar — [statistics blog, low-quality source for these subgroup figures](https://studycardsai.com/blog/active-recall-statistics) [S]; the 0.50-0.61 range is corroborated by a [Frontiers review](https://www.frontiersin.org/articles/10.3389/fpsyg.2018.02412/pdf) [S]. I could not open Adesope itself.
- Testing was only marginally better than other elaborative strategies (g = 0.095, p = .062). The classroom effect is mostly against passive control — [Yang et al. 2021](https://gwern.net/docs/spacedrepetition/2021-yang.pdf) [O].

Moderators that describe "one short end quiz":
- Single treatment g = 0.385-0.389, rising to 0.624 for treatment beyond a semester — [Yang 2021](https://gwern.net/docs/spacedrepetition/2021-yang.pdf) [O].
- Items tested once g = 0.444, twice 0.601, three or more 0.642 — [Yang 2021](https://gwern.net/docs/spacedrepetition/2021-yang.pdf) [O].
- Tested material g = 0.512 vs untested material g = 0.321 — [Yang 2021](https://gwern.net/docs/spacedrepetition/2021-yang.pdf) [O]; this contradicts Pan & Rickard's null for untested material, which Yang attributes to power and semantic coherence.
- Retention under 1 day g = 0.41 [0.31, 0.51]; 1 day or more g = 0.69 [0.56, 0.81] — [Rowland 2014](https://courseware.epfl.ch/assets/courseware/v1/fdde2f0aa590bf3b1324077a6bf1540c/asset-v1%3AEPFL%2BDEMO%2B2020%2Btype%40asset%2Bblock/Rowland2014-meta-analysis.pdf) [O].

Multiple choice versus recall (the literature disagrees):
- Rowland: initial cued recall g = 0.61; recognition g = 0.29 [0.10, 0.47]. He cautions that cued recall was confounded with more feedback (44% vs 11% of effects) — [Rowland 2014](https://courseware.epfl.ch/assets/courseware/v1/fdde2f0aa590bf3b1324077a6bf1540c/asset-v1%3AEPFL%2BDEMO%2B2020%2Btype%40asset%2Bblock/Rowland2014-meta-analysis.pdf) [O].
- In classrooms there was no difference: with feedback recall g = 0.541 vs recognition 0.607; without feedback 0.520 vs 0.518 — [Yang 2021](https://gwern.net/docs/spacedrepetition/2021-yang.pdf) [O].
- Adesope found MCQ stronger than short answer, the opposite of Rowland. A proposed reason is that Rowland excluded applied research — [Frontiers review snippet](https://www.frontiersin.org/articles/10.3389/fpsyg.2018.02412/pdf) [S].

Distractors:
- Competitive alternatives improved later answers to questions about the wrong options themselves: 47% vs 36% control (d = 0.42, Exp 1); 46% vs 37% (d = 0.43, Exp 2). Noncompetitive alternatives gave no such benefit for related items. Directly tested items improved under both (52% vs 29%, d = 1.25 and 1.04) — [Little & Bjork 2015](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2017/01/LittleBjorkMC2014.pdf) [O]. Lab study.
- Cost: competitive questions were harder at first (66% vs 83-86% correct) — [Little & Bjork 2015](https://bjorklab.psych.ucla.edu/wp-content/uploads/sites/13/2017/01/LittleBjorkMC2014.pdf) [O].
- Butler's guidance favours three options, simple formats and no trick questions — [Edutopia summary](https://www.edutopia.org/article/5-tips-designing-multiple-choice-quizzes) [S]. Unsure guessers can pick up incorrect information (negative suggestion), and reviewing the correct answers substantially reduces that — [Butler blog post](https://learningscientists.org/blog/2017/10/10-1?format=amp) [S].

Feedback:
- Feedback g = 0.73 vs none g = 0.39 — [Rowland 2014](https://courseware.epfl.ch/assets/courseware/v1/fdde2f0aa590bf3b1324077a6bf1540c/asset-v1%3AEPFL%2BDEMO%2B2020%2Btype%40asset%2Bblock/Rowland2014-meta-analysis.pdf) [O]. In classrooms 0.537 vs 0.374 — [Yang 2021](https://gwern.net/docs/spacedrepetition/2021-yang.pdf) [O]. Contradicted by Adesope, who found no moderation (0.63 vs 0.60) — [as reported by Yang 2021](https://gwern.net/docs/spacedrepetition/2021-yang.pdf) [S].
- Explanation feedback beats correct-answer feedback on transfer, not on retention. New inference questions: .45 vs .30 (d = 0.90), and .45 vs .28 against no feedback; replicated at .37 vs .27 (d = 0.50). N = 60 Duke students in Exp 1, two sessions 2 days apart — [Butler, Godbole & Marsh 2013](https://bpb-us-e2.wpmucdn.com/sites.wustl.edu/dist/8/805/files/2026/06/Butler-et-al.-2013-Explanation-feedback-is-better-than-correct-answer-feedback-for-promoting-transfer-of-learning.pdf) [O].
- Computer-based feedback meta-analysis: elaborated 0.49, correct answer 0.32, right/wrong only about 0.05 — [Van der Kleij et al. 2015 quoted in a vendor-commissioned review](https://collegereadiness.uworld.com/wp-content/uploads/2024/11/UWorld-College-Readiness-Research-Paper.pdf) [S].

Transfer:
- Testing yields transfer of d = 0.40 [0.31, 0.50] (192 effects, 122 experiments, N = 10,382). It is greatest across test formats and to application and inference questions; weakest to untested material seen at study and to problems involving worked examples — [Pan & Rickard 2018](https://sc-pan.github.io/pdf/PR_2018.pdf) [O].
- Three moderators decide it. With no response congruency, no elaborated retrieval and low initial accuracy, transfer is about zero, and negative under PEESE correction. With all present, d = 0.90 (0.58 under PEESE) — [Pan & Rickard 2018](https://sc-pan.github.io/pdf/PR_2018.pdf) [O]. Transfer increases when tests require discriminating between concepts or constructing an explanation.
- Later work found that testing-effect size can be independent of retrieval-practice performance, so the link to initial accuracy is contested — [Chan et al. 2024](https://doi.org/10.1037/xge0001593) [A].

Placement:
- Adjunct questions help most on repeated questions and less on related ones, and higher-order questions help on higher-order tests. Effects track text length and question density; delay and age did not moderate — [Hamaker 1986 abstract](https://doi.org/10.3102/00346543056002212) [A].
- Inserted versus post-reading comparisons are mixed, and classic work rarely used long texts needing a coherent mental model of the whole passage — [2022 Instructional Science paper, snippet](https://link.springer.com/article/10.1007/s11251-022-09592-7) [A].
- Interim testing reduced mind wandering in a statistics lecture; a similar study with a presumably more engaging public-health lecture found it changed only the type of mind wandering, not the frequency — [as reported in Ahn & Chan 2024](https://par.nsf.gov/servlets/purl/10511811) [S], primary: [Szpunar et al. 2013](https://doi.org/10.1073/pnas.1221764110). So the attention benefit may be largest for dull material. Frequent tests also lowered test anxiety — [as reported by Yang 2021](https://gwern.net/docs/spacedrepetition/2021-yang.pdf) [S].
- There is a named downside: Davis, Chan & Wilford 2017, "Frequent switching between retrieval and encoding impairs new learning" — [title in reference list](https://par.nsf.gov/servlets/purl/10511811) [S]. I could not read it.

Adult professionals (the most relevant field evidence):
- Continuing education: g = 0.314, CI crosses zero, p = .119, k = 6, all single-workshop treatments. Yang says no firm conclusion can be drawn — [Yang 2021](https://gwern.net/docs/spacedrepetition/2021-yang.pdf) [O].
- RCT with practising physicians at a 3-day course: two 20-MCQ tests vs study handout, final at 8 weeks. 0.75 vs 0.77, p = .35. Only 49 of 75 finished. No feedback was given, by design — [McConnell et al. 2018](https://cmej.ca/index.php/cmej/article/download/42236/pdf) [O].
- Earlier RCT with 83 physicians, short answer: 42.5% vs 41.2%, p = .71 — [McMaster record](https://experts.mcmaster.ca/display/publication812024) [A].
- Positive case: Larsen et al. 2015 used four spaced quizzes with feedback at neurology meetings. McConnell notes identical questions were reused, which may inflate the result — [McConnell et al. 2018](https://cmej.ca/index.php/cmej/article/download/42236/pdf) [O].
- The authors' proposed explanation: nearly all testing research uses learners building foundations, and practising clinicians may already have ample retrieval practice. They also report clinicians' aversion to test-like activity — [McConnell et al. 2018](https://cmej.ca/index.php/cmej/article/download/42236/pdf) [O].

### Inferences

- **One end quiz of five MCQs:** modest and uncertain for memory. For students the moderators imply roughly g 0.3-0.6 on the tested points only. For professionals the estimate cannot be distinguished from zero. It is unlikely to harm, but it should not be the main mechanism, and it should not be presented as proof of understanding.
- **Embedded beats end for this format, but on fit and not on proven effect.** The direct evidence on placement is mixed. The reasons to embed are that it keeps a self-paced reader attending, gives calibration while there is still time to act on it, and matches natural segments. Avoid a question every few paragraphs. Two to four checkpoints at segment boundaries plus at most one cumulative end question is a defensible default, not a measured optimum.
- **Spend questions on consequences.** Benefits concentrate on what is asked, so ask about behavioural change, invariants, failure modes and blast radius, and never about names, file paths or incidental detail.
- **Prefer application questions.** "What happens if X is null after this change?" fits Pan & Rickard's conditions better than "What does the new helper do?".
- **Build distractors from real misreadings:** the old behaviour, the behaviour of an adjacent code path, the plausible fix that was rejected. This is the one place the generator has an advantage, because it can see the diff, the alternatives and the tests. Use three options, and no trick questions.
- **Tension to manage:** competitive distractors reduce first-try accuracy, and Pan & Rickard link higher accuracy with more transfer. Place harder questions after the relevant explanation, and put the ones meant to fail before it, as prediction.
- **Feedback is mandatory and must explain.** After any answer, show why the right option is right and why each wrong option is wrong, tied to specific lines. Right/wrong alone is close to worthless in the pooled data. The strongest professional null also had no feedback, so it does not rule out a feedback version.
- **Do not reuse the quiz text as its own evidence.** Showing a score invites an inflated reading of "I understood it", because repeated-question gains overstate transfer.

### Gaps

- I could not read Chan, Meissner & Davis 2018, which is the meta-analysis of test-potentiated new learning. Its pooled effect and treatment of interpolated testing are unverified.
- Szpunar 2013 and Davis 2017 are known here only through other papers, so I report no numbers for them. My direct fetches of these did not return the paper.
- No study compares embedded with end-of-text questions in a 5-20 minute professional reading task.
- Whether MCQ is weaker than recall for experts is unknown. The McConnell result used MCQ and no feedback, so format and feedback are confounded there.

## Pretesting and prequestions

### Takeaway

Prequestions work well and very narrowly: g = .66 for the exact information asked about and g = .01 for everything else. Use two or three prequestions aimed at the most important points, not a general warm-up. Direct evidence on professional adults does not exist in what I could find.

### Cited Findings

- Multilevel meta-analysis: prequestioned content g = .66; non-prequestioned content g = .01, with no evidence of a general benefit. About 6,704 experimental and 5,299 control participants. Feedback plus prequestions beat prequestions alone. Children and teens did not differ significantly from adults. The specific benefit held across learning-event, sample and assessment variations — [King-Shepard et al. 2025](https://link.springer.com/article/10.1007/s10648-025-10075-7) [O].
- Generating an answer g = 0.65 vs only reading the question g = 0.22 — [St. Hilaire et al. 2024 as reported in Rivers et al. 2026](https://sc-pan.github.io/pdf/RBPT_2026.pdf) [S].
- Typed and mental answers were equally effective across two experiments with undergraduates, and prequestioning was just as effective as reviewing statements about what was to come — [Rivers et al. 2026](https://sc-pan.github.io/pdf/RBPT_2026.pdf) [O]. This qualifies the generate-vs-read gap above and is recent, so treat it as provisional.
- For post-study retrieval, covert retrieval g = 0.23 vs restudy, and overt adds g = 0.17 — [Yu et al. 2025 as reported in Rivers et al. 2026](https://sc-pan.github.io/pdf/RBPT_2026.pdf) [S].
- Pretest vs posttest conflict: Latimier 2019 and de Lima & Jaeger 2020 favoured retrieval practice at one week; Pan & Sana 2021 favoured pretesting at 5 minutes and 48 hours (d = 0.30 and 0.14). Combining the two added nothing significant in two studies — [Pan & Carpenter 2023](https://link.springer.com/article/10.1007/s10648-023-09814-5) [O].
- Pan & Sana is the closest to a general adult sample: five experiments, n = 1,573, including MTurk workers reading expository text; MCQ or cued recall, with or without feedback. The 48-hour advantage held only for previously seen questions, not novel ones — [Pan & Sana 2021](https://sc-pan.github.io/pdf/PS_2021.pdf) [O].
- Prequestions need follow-up study of the answers. Benefits are most consistent for discrete facts stated directly in the material, and complex inference questions have shown little benefit. Transfer research is described as in its infancy — [Pan & Carpenter 2023](https://link.springer.com/article/10.1007/s10648-023-09814-5) [O].
- Mechanism: a three-stage framework in which testing triggers curiosity, question memory and candidate generation; encoding then improves through attention, answer search and linking; and better encoding, plus question memories acting as cues, drives posttest performance — [Pan & Carpenter 2023](https://link.springer.com/article/10.1007/s10648-023-09814-5) [O].
- Effects depend on the questions being remembered — [St. Hilaire & Carpenter 2020](https://www.bohrium.com/paper-details/prequestions-enhance-learning-but-only-when-they-are-remembered/812599212381306880-8508) [A]. In realistic lectures the benefit was limited — [Toftness et al.](https://pure.royalholloway.ac.uk/en/publications/the-limited-effects-of-prequestions-on-learning-from-authentic-le/) [A].
- Multiple-choice lures produced transfer to untested material that cued-recall pretests did not — [Pan & Carpenter 2023](https://link.springer.com/article/10.1007/s10648-023-09814-5) [O]. Integrative rather than isolated prequestions gave d = 0.60 on non-prequestioned content in one study — [St. Hilaire et al. 2019 as reported in a 2024 AERA poster](https://par.nsf.gov/servlets/purl/10620923) [S]. This is an outlier against the g = .01 average.
- Field results: an aerospace course gained about 9-12% on unit tests, and a classroom study about 7% on an immediate posttest but not significantly at one week. In a MOOC, pretesting increased dropout while those who stayed scored better. Students often prefer reading and may need a warm-up to see the benefit — [Pan & Carpenter 2023](https://link.springer.com/article/10.1007/s10648-023-09814-5) [O].

### Inferences

- **Yes, ask before reading, with a narrow aim.** Pick the two or three things the reader most needs from the change and ask about those. The g = .01 result also means there is no average harm to other content, which answers the worry that prequestions steal attention from the rest. That average may hide skimming, though.
- **Use prequestions for direct behaviour, not deep inference.** "Which callers now get a different return value?" fits; "Why is this design better?" does not fit as a prequestion, and belongs after the explanation.
- **Skip typing.** Offer "think, choose, reveal". Choosing an option or forming a mental answer appears sufficient, and it is lighter than a text box. A forced choice or an explicit "don't know" also gives the document something to react to.
- **Consider a cheaper alternative.** Rivers 2026 suggests a short "watch for these three things" statement may do similar attentional work with no interaction. Because that result is fresh, an A/B test inside the app is worth more than a decision from the literature.
- **Dropout is a real product risk.** A hard question at the top of a document, for a reader with a merge to get through, may push them to skip the whole document. Make every interaction skippable with one key press, and do not open with something that feels like an exam.
- **Authors differ from reviewers.** A reviewer can honestly attempt a prediction. An author of AI-written code may be able to answer from intent while still being wrong about the implementation, which is where a prequestion is most diagnostic.

### Gaps

- No prequestion study on working professionals or software material was found. The nearest are course settings and crowd workers.
- King-Shepard's results for number of prequestions, text length, delay and publication bias were not in the portion of the text available to me.
- Whether prequestions change how much of a long document is actually read, as opposed to test performance, is unmeasured in what I found.

## Spaced repetition: worth it for one change?

### Takeaway

Spacing is among the best-supported effects in the field, but it needs a second session days later, which a one-shot document does not have. It is not worth it for details of one change. It is worth considering only for the small durable residue: system invariants, new contracts and failure modes that will matter for months.

### Cited Findings

- Rated high utility, with practice testing, in the major review — [Dunlosky et al. 2013, APS release](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html) [S].
- Internet study of 1,354 adults (mean age 34, range 18-72), learning 32 obscure facts, with gaps up to 3.5 months and tests up to a year later — [Cepeda et al. 2008](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf) [O]. An unusually adult sample, but on trivia rather than conceptual material.
- Optimal gap, interpolated for recall: about 3, 8, 12 and 27 days for tests at 7, 35, 70 and 350 days, or 43%, 23%, 17% and 8% of the delay — [Cepeda et al. 2008](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf) [O].
- Recall gain of optimal gap over zero gap: 10%, 59%, 111% and 77% for those delays. A review delivered at about 3 minutes is treated as the zero-day gap — [Cepeda et al. 2008](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf) [O].
- For a 7-day horizon the gain is small (10%). The authors note the optimal gap is not an absolute quantity but depends on when the knowledge is needed, and for retention over years they suggest a delayed review of several months — [Cepeda et al. 2008](https://www.evullab.org/pdf/CepedaVulRohrerWixtedPashler-PS-2008.pdf) [O].
- Field with professionals: question-based spaced education was trialled with urologists on clinical guidelines, and a VA trial examined behaviour change in primary-care providers. The retention figures I found come from developers' materials and press, so I report none — [Kerfoot et al. trial PDF, snippet](https://www.evl.uic.edu/datsoupi/420/docs/00000658-200905000-00011-2.pdf) [A], [trial registry](https://clinicaltrials.gov/study/NCT01168323) [A], [Harvard Magazine](https://www.harvardmagazine.com/2009/11/spaced-education-boosts-learning) [S].
- Closest format analogue: Quantum Country embeds 112 review cards in a long essay, with the first review 5 days later and intervals expanding to about 4 months. After six repetitions, most users showed about 54 days of retention per question for about 95 minutes of review, against about 4 hours of reading. An informal delayed-review comparison went 91% to 87% vs 89% to 96%. The authors call these results preliminary, uncontrolled and "a grain of salt" — [Matuschak & Nielsen](https://numinous.productions/ttft/) [O].

### Inferences

- **Minimum viable spacing:** one retrieval a few days later, if the knowledge must last a week or more. Nothing inside a 5-20 minute session counts as spacing, because Cepeda's zero-gap condition is a few minutes. Within-document repetition is not spaced repetition.
- **Change details expire.** Most facts about a specific diff become stale or irrelevant within weeks, and the code and history remain available to look up. Memorising what can be re-read is a poor trade. The return on a review falls further because the 7-day gain is small.
- **The durable residue is a different object.** A new invariant, a changed contract, or "why not the obvious approach" may be useful for months. If the app ever does this, generate at most two or three candidate cards per change, make them opt-in, and attach them to the system or area rather than to the PR. This belongs at library level, not in the document.
- **A cheap substitute for review:** bring the check back at the moment of need, such as when the reader reopens a related file or document. This is speculative, and I found no evidence on it.

### Gaps

- I did not obtain Cepeda et al. 2006 or any spacing study on software knowledge.
- I found no data on how quickly developers forget details of a specific change, or whether that forgetting costs anything. That is the empirical question this decision depends on.
- The published Kerfoot outcomes could not be verified directly, so I report no effect sizes.

## Self-explanation, elaborative interrogation and the Dunlosky ratings

### Takeaway

Prompted self-explanation has a solid effect (g = .55) and beats receiving an instructional explanation (g = .35). But it costs time and does not suit a multiple-choice format. Use one well-placed open prompt at the point of greatest conceptual load, and keep it optional.

### Cited Findings

- 69 effect sizes, 5,917 participants, g = .55 [.45, .65], with significant heterogeneity — [Bisra et al. 2018](https://www.Gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf) [O].
- Mechanism: generating inferences about causal connections and conceptual relations, connecting new information to prior knowledge, and monitoring and repairing gaps — [Bisra et al. 2018](https://www.Gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf) [O].
- Self-explanation outperformed instructional explanation, g = .35. The authors conclude that having learners generate an explanation is often more effective than presenting one — [Bisra et al. 2018](https://www.Gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf) [O]. This is the most uncomfortable finding for a product built around explanations written for the reader.
- Education level did not moderate significantly: undergraduates g = .611 (k = 42); professional programs g = .680 (k = 4, n = 304, CI .11-1.25). These are students in professional training, not practitioners — [Bisra et al. 2018](https://www.Gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf) [O].
- Prompt format matters: multiple-choice prompts g = .24, not different from zero (k = 2), which the authors suspect reflects too much cueing. Fill-in-the-blank g = .895 (k = 2). Metacognitive prompts showed no detectable effect — [Bisra et al. 2018](https://www.Gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf) [O].
- Anticipatory self-explanation g = 1.37, but only one study. Justifying decisions g = .42-.43 — [Bisra et al. 2018](https://www.Gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf) [O].
- Timing was not a significant moderator (concurrent g = .521, k = 57; retrospective g = .571, k = 8). Specific vs general prompts did not differ — [Bisra et al. 2018](https://www.Gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf) [O].
- Time: g = .72 where self-explanation took longer and .41 where time was similar; the difference was not significant, but time-on-task was poorly reported, so efficiency may be overstated — [Bisra et al. 2018](https://www.Gwern.net/doc/psychology/spaced-repetition/2018-bisra.pdf) [O].
- Boundary: in worked examples for math, adding self-explanation prompts was associated with a negative effect relative to no prompts — [Barbieri et al. 2023 abstract](https://link.springer.com/content/pdf/10.1007/s10648-023-09745-1.pdf) [A]. This conflicts with the general Bisra result.
- Dunlosky: practice testing and distributed practice rated high. Rereading, highlighting or underlining, summarization and mnemonic devices rated low. Techniques rated moderate are said to deserve use in appropriate situations — [APS release](https://www.psychologicalscience.org/news/releases/which-study-strategies-make-the-grade.html), [APS summary](https://www.psychologicalscience.org/publications/journals/pspi/learning-techniques.html) [S]. The authors stress these are not a panacea and benefit motivated, capable users.
- Monitoring side-benefit: self-explaining improved comprehension-judgment accuracy by 0.179 in correlation — [Yang et al. 2023](https://discovery.ucl.ac.uk/10150804/2/Shanks_Mind%20the%20Gap%20Between%20Comprehension%20and%20Metacomprehension_AAM.pdf) [O]. Prinz et al. found every intervention significant except self-explaining, which conflicts — [Prinz, Golke & Wittwer 2020](https://link.springer.com/article/10.1007/s10648-020-09558-6) [A].

### Inferences

- **Use one or two prompts per document.** Place them at the central design decision: "Before reading on, explain to yourself why this needs a lock here." Do not sprinkle them. Students in studies were compelled to comply and a working developer will not be.
- **Do not turn self-explanation into an MCQ.** A menu of explanations is recognition, not construction. MCQ is fine for prediction and retrieval, but when the goal is explanation, keep it open: free text, or an honest "say it in your head, then compare".
- **Compare, don't grade.** After the reader answers, show a model explanation and let them mark what they missed. No rubric is needed. The app could optionally grade with Claude, but evidence for that is outside this review.
- **"How confident are you?" alone is not self-explanation.** Metacognitive prompts showed no effect. Ask for content.
- **An anticipatory "what will this need to handle?" prompt** matches predict-observe-explain, but g = 1.37 from one study should not be cited as an estimate.
- **Elaborative interrogation** (asking why) is close to the "justify" category at g = .42-.43, and is the natural form for design rationale. Treat it as a variant of the same prompt, not a separate feature.

### Gaps

- The full Dunlosky monograph returned 403. The pages I could open do not list all ten ratings. The moderate list, which I recall as elaborative interrogation, self-explanation and interleaved practice, is unverified here, as are the authors' specific limits on those techniques.
- I found no direct effect sizes for elaborative interrogation in this research, and no data on voluntary compliance with such prompts in self-paced reading by professionals.

## Worked examples, contrasting cases, refutation and predict-observe-explain

### Takeaway

Predict-then-observe is the most direct analogue for an interactive code explanation, and computing evidence agrees: what the reader does with a visualization matters more than the visualization. Refutation is the best free technique. A diff is already a contrasting case. Worked examples are useful but reverse with expertise.

### Cited Findings

Predict-observe-explain:
- Crouch et al. taught a 133-student premedical physics course, tested at the end of the semester with free-response questions (122 students), combining seven demonstrations — [Crouch et al. 2004](https://www.otffeo.on.ca/en/wp-content/uploads/sites/2/2014/11/Mazur_demo-article.pdf) [O].

| Mode | Correct outcome | Correct explanation | Class time |
|---|---|---|---|
| No demonstration | 61% | 22% | n/a |
| Observe | 70% (p = .03, h = .19) | 24% (p = .64, h = .05) | 11 min |
| Predict | 77% (p = .001, h = .35) | 30% (p = .04, h = .18) | 13 min |
| Discuss | 82% (p = .0001, h = .47) | 32% (p = .02, h = .23) | 21 min |

- Observing improved recall of the outcome slightly but explanations not at all. Predicting doubled the effect on outcomes and nearly quadrupled it on explanations, for about 2 extra minutes. Discussion added little for 8 more minutes. Even the best condition reached only 32% fully correct explanations, and the authors suggest limits to what one demonstration can do — [Crouch et al. 2004](https://www.otffeo.on.ca/en/wp-content/uploads/sites/2/2014/11/Mazur_demo-article.pdf) [O].
- MCQ predictions were correct 26% of the time vs 41% for open-ended predictions, and plausible distractors may have raised the error rate. Yet this large gap in prediction accuracy produced only a marginal difference on the final test — [Crouch et al. 2004](https://www.otffeo.on.ca/en/wp-content/uploads/sites/2/2014/11/Mazur_demo-article.pdf) [O].
- Design limits: one premed course at Harvard. Modes rotated across 15-20 student sections week to week, so students experienced all modes; this was not individual randomization. Students absent from a section were counted in the no-demonstration control, which could depress the control rate — [Crouch et al. 2004](https://www.otffeo.on.ca/en/wp-content/uploads/sites/2/2014/11/Mazur_demo-article.pdf) [O]. The absence point is my reading, not the authors'.
- Generating predictions works across ages, and processing the feedback on the prediction appears crucial. It was as effective as generating examples for university students. Many studies are with children, and there is no control-group comparison in the key adult study. Surprise and curiosity are the proposed mechanisms — [Brod 2021](https://www.pedocs.de/volltexte/2021/23704/pdf/EPR_2021_4_Brod_Generative_Learning_A.pdf) [O].
- Noetel lists cognitive conflict as an emerging principle without meta-analytic support yet — [Noetel et al. 2022](https://doi.org/10.3102/00346543211052329) [O].

Computing analogue:
- Of 24 algorithm-visualization experiments, 11 were significant. Theories of active engagement predicted 77% of significant results, while "better graphics teach better" predicted 30% — [Hundhausen, Douglas & Stasko 2002](https://doi.org/10.1006/jvlc.2002.0237) [O].
- The authors conclude the form of the learning exercise is more important than the quality of the visualization. Successful uses include what-if analysis, prediction exercises and programming exercises — [Hundhausen et al. 2002](https://doi.org/10.1006/jvlc.2002.0237) [O].
- Byrne et al. found a benefit for prediction plus animation (the two could not be separated statistically). A replication attempt that removed prediction was reported as supporting the engagement account rather than the animation. In Hansen et al.'s series, an interactive environment beat text and lecture, but when the text group also did paper-and-pencil exercises, no significant difference remained — [Hundhausen et al. 2002](https://doi.org/10.1006/jvlc.2002.0237) [O]. This evidence is from 2002 or earlier, with students.

Refutation:
- g = 0.41, 44 comparisons, n = 3,869 — [Schroeder & Kucera 2022](https://www.x-mol.com/paper/1486077293217726464) [A].
- 76 studies, 294 effects: g = 0.37 and 0.36 by design. No evidence of widespread backfire. None of the broad moderator set was significant, which led the authors to conclude that the effect may be modest but stable — [Danielson et al. 2024](https://par.nsf.gov/servlets/purl/10629626) [O]. Scope: scientific misconceptions, K-12 through college.

Contrasting cases:
- 57 experiments, 336 tests, d = .50 [.44, .56], heterogeneous. Better when learners look for similarities, when the principle comes after the comparison, for perceptual content, and on immediate tests. Perceptual content beat procedural — [Alfieri et al. 2013](https://synapsesocial.com/papers/W2124645092) [A].
- Problem-solving before instruction: g = 0.36 [0.20, 0.51] across 53 studies, larger for older students, and requiring some prior knowledge. A bias correction moved it up to 0.87, which is unusual and should make readers cautious — [Sinha & Kapur 2021](https://www.x-mol.com/paper/1406031499744456704) [A].

Worked examples:
- Math: g = 0.48. Correct-only examples beat incorrect-only or mixed examples — [Barbieri et al. 2023](https://link.springer.com/content/pdf/10.1007/s10648-023-09745-1.pdf) [A]. A poster version reported g = 0.43, with sample counts varying across secondary sources.
- Pace of fading interacts with knowledge. In electrical circuit analysis, more knowledgeable learners did better with fast or immediate transitions; low-knowledge learners did better with slow fading — [Reisslein 2005 in Kalyuga 2007](https://www.uky.edu/~gmswan3/EDC608/Kalyuga2007_Article_ExpertiseReversalEffectAndItsI.pdf) [O].
- Testing transfers poorly to problems involving worked examples — [Pan & Rickard 2018](https://sc-pan.github.io/pdf/PR_2018.pdf) [O].

### Inferences

- **Make predict-then-reveal the signature interaction.** Before revealing a concrete behaviour, such as output for a chosen input, a state transition, or which test now fails, ask for a prediction. Then show the result and an explanation. The result should be real, such as test output or a captured trace, whenever the skill can obtain it.
- **Interactive diagrams without a task are likely decoration.** Hundhausen and Crouch agree. A stepper or slider earns its place only if the reader must commit to something before moving it. This is the most important implication for the skill: do not measure success by how impressive the widget is.
- **Keep the gain in proportion.** Crouch shows a real but small rise from a low base, with most learners still unable to give a full explanation. It is a cheap improvement, not a guarantee.
- **Being wrong in the prediction seems to matter little.** Crouch's accuracy gap barely changed outcomes, and prequestion benefits occur despite mostly wrong answers, so don't penalize or scold. Open prediction may produce better thinking than MCQ, but costs more; use MCQ by default and open prediction for the single most important item.
- **Refutation is a generator rule.** Whenever a likely misreading exists, state it, say it is wrong, and give the causal reason: "This looks like a retry, but it is not, because...". Candidates are behaviour that looks unchanged, names that mislead, and tests that pass for the wrong reason. It costs the reader nothing and has no known backfire. The limit is honesty: invented misconceptions add noise, so the skill should refute only misreadings grounded in the diff.
- **Treat the diff as a contrasting case.** Present old vs new behaviour aligned on the same input. Ask what is invariant and what changed, then state the principle after the comparison, which is the moderator direction in Alfieri. Procedure content is weaker than perceptual, and immediate-test advantages may fade.
- **Show one worked trace through the changed path,** with subgoal labels, as a collapsible section for readers new to the area. Do not make experts walk through it. Use correct examples by default; bugs fixed by the change are the natural exception.

### Gaps

- I found no predict-observe-explain study with professional programmers, and no modern replication of Hundhausen-style results in documents like these.
- Whether Crouch's result holds outside physics demonstrations, where intuitions are strong, is unknown. Code behaviour may differ, because experts can often trace instead of guess.
- The Barbieri, Alfieri and Sinha moderators are from abstracts. No computing-specific faded-example estimate was verified.
- Worked-example evidence for programming, including a systematic review I recall but could not retrieve, is missing here because the search budget ran out.

## Expertise reversal: what does "background for beginners, skippable by experts" imply?

### Takeaway

Yes, the reversal is real and strongest in higher education: support that helps novices harms experts about as much. But "skippable" alone is not adaptation, because learner control has almost no average benefit and people judge their own knowledge poorly. Make background collapsed by default, and let a quick diagnostic question open it. Prior knowledge has to be judged per topic, not per person.

### Cited Findings

- 60 studies, 176 effects, almost 6,000 participants. High-support instruction helped low prior knowledge learners (d = 0.505) and hurt high prior knowledge learners (d = -0.428). The effect grew with age, was strongest in higher education, and was smaller in language and humanities — [Tetzlaff et al. 2025](https://doi.org/10.1016/j.learninstruc.2025.102142) as summarized by [Learning and the Brain](https://www.learningandthebrain.com/blog/one-size-doesnt-fit-all-teaching-experts-and-novices/) [S]. The citation is verified, but I could not open the paper to check the numbers.
- Before this meta-analysis, a narrative review reported effect-size differences of 0.45-2.99 between novices and experts, with a mid-range of 1.72. In most studies the effect was lopsided, stronger on one side than the other — [Kalyuga 2007](https://www.uky.edu/~gmswan3/EDC608/Kalyuga2007_Article_ExpertiseReversalEffectAndItsI.pdf) [O].
- Mechanism: experts must reconcile redundant external guidance with their own schemas, which adds working-memory load. What is essential to novices becomes redundant to others — [Kalyuga 2007](https://www.uky.edu/~gmswan3/EDC608/Kalyuga2007_Article_ExpertiseReversalEffectAndItsI.pdf) [O].
- Learner control: research is inconclusive and more often negative; it depends on learners selecting good strategies — [Kalyuga 2007](https://www.uky.edu/~gmswan3/EDC608/Kalyuga2007_Article_ExpertiseReversalEffectAndItsI.pdf) [O]. A later meta-analysis (18 studies, 29 effects) found g = 0.05 — [Karich et al. 2014 via Corwin](https://corwinvisiblelearningsolutions.sagepub.com/support/solutions/articles/7000090422-i-am-curious-about-the-poor-student-achievement-outcomes-associated-with-student-control-over-learnin) [S].
- Rapid diagnostics: a first-step test (show a task, indicate your first step) or a rapid verification test (judge proposed steps). Rapid verification scores correlated .71 and .75 with observed problem-solving, with testing time cut by factors of 3.2 and 3.5. Tutorials adapted with the first-step test gave better gains than non-adapted tutorials, effect size 0.46 — [Kalyuga 2007](https://www.uky.edu/~gmswan3/EDC608/Kalyuga2007_Article_ExpertiseReversalEffectAndItsI.pdf) [O]. Authors of these methods ran most of these studies, on school and college math and science.
- Advisement is an alternative to full system control: learners decide, with the system recommending — [Kalyuga 2007](https://www.uky.edu/~gmswan3/EDC608/Kalyuga2007_Article_ExpertiseReversalEffectAndItsI.pdf) [O].
- Counter-evidence for design principles: across multimedia reviews, learner prior knowledge did not significantly moderate effects (p = .14) — [Noetel et al. 2022](https://doi.org/10.3102/00346543211052329) [O]. Segmenting benefited high prior knowledge learners more on retention — [Rey et al. 2019](https://is.tuebingen.mpg.de/publications/rey2018segmenting) [A]. So expertise reversal does not apply to every principle. It is best established for guidance and redundant explanation.
- Hypertext results are conditional: the same reversal depends on task and material specifics — [Kalyuga 2007](https://www.uky.edu/~gmswan3/EDC608/Kalyuga2007_Article_ExpertiseReversalEffectAndItsI.pdf) [O].

### Inferences

- **"Background for beginners" in the main flow is the worst option.** It costs experts twice: reading time plus the load of reconciling it. Default to collapsed, with a label that states exactly what it contains ("How the retry queue works, 2 min"), so the choice is informed.
- **Do not rely on a self-rating.** Asking "are you familiar with X?" is a metacomprehension judgment, and those are poor (see below). Instead ask a one-question check about X. Wrong or "not sure" opens the background and recommends it; right leaves it closed. This is the advisement model and should stay overridable. A first-step question translates directly: "Where would you look first to find X?"
- **Prior knowledge is local.** An author of AI-written code may know the intent and the domain very well, and the implementation not at all. A reviewer may know the subsystem but not the motivation. A global "beginner/expert" toggle is the wrong abstraction; the unit of adaptation is the concept or section.
- **Keep the app's advantage in mind.** A local viewer knows prior documents, the repo, and possibly the reader's git authorship. The generator could reasonably default to "you touched this file 40 times; background collapsed", although I found no evidence testing this.
- **What survives for experts:** the claims, the risks, the evidence, and the decisions. Expert-facing material should be the main track, with novices served by expansions. This also fits the finding that most instructional material implicitly assumes novices by default.
- **Reduced guidance has its own risk.** The expert estimates come from people who actually have the schema. Someone who feels expert but is not will skip the background, which is why the diagnostic matters more than the toggle.

### Gaps

- The Tetzlaff figures should be checked against the paper before being quoted as final. ScienceDirect refused the fetch.
- All evidence is on learners in education or short training, with no studies of expert reversal among practising developers, or of adaptive documents.
- The accuracy of a single diagnostic question is unknown. The .71/.75 correlations came from several-item rapid tests.

## Mayer's multimedia principles: how well have they held up?

### Takeaway

They hold up in aggregate, with moderate effects, but review quality is modest, and effects are smaller for self-paced reading. For this format, contiguity and coherence are the best bets, signaling helps mostly less-expert readers, and segmenting is safe. Modality can be ignored. I found no meta-analytic support for pre-training.

### Cited Findings

- 29 reviews, 1,189 studies, 78,177 participants. 11 principles had significant positive effects on learning, 5 on cognitive load. Largest: captioning second-language video, temporal and spatial contiguity, and signaling — [Noetel et al. 2022](https://doi.org/10.3102/00346543211052329) [O].
- Quality warning: few reviews reported duplicate screening, only one did formal quality assessment, and bias-assessment methods were often weak — [Noetel et al. 2022](https://doi.org/10.3102/00346543211052329) [O]. Pooled estimates may be inflated.
- Pacing and complexity: see the first section (0.41 vs 0.27; 0.70 vs 0.20). Education level, medium and subject did not consistently moderate — [Noetel et al. 2022](https://doi.org/10.3102/00346543211052329) [O].
- **Contiguity:** overall d = 0.85, spatial d = 0.72, temporal d = 0.78 (Ginns); integrated designs g = 0.63 (Schroeder & Cenkci) — [as tabulated in Noetel et al. 2022](https://doi.org/10.3102/00346543211052329) [O].
- **Signaling:** d = 0.38, low prior knowledge d = 0.47 (Alpizar); r = 0.17 overall, with r = 0.19 for low and r = -0.08 for high prior knowledge (Richter); retention and transfer g = 0.33 and 0.53 — [Noetel et al. 2022](https://doi.org/10.3102/00346543211052329) [O]. Sources disagree on which figure belongs to which outcome: Noetel gives transfer .53 and retention .33, while [a slide deck on Schneider et al. 2018](https://ksvi.mff.cuni.cz/amulab/wp-content/uploads/2018/11/MultimLn3_BromHannemann_181117.pdf) [S], which also gives k = 145 and N = 12,201, reports the reverse. Check the original before quoting either.
- **Coherence:** removing seductive details g = 0.33 [0.18, 0.48], k = 68. Larger when details stay on screen (0.43) and for learners with no prior experience (0.52) — [Sundararajan & Adesope 2020 in Noetel et al. 2022](https://doi.org/10.3102/00346543211052329) [O].
- **Segmenting:** retention g = 0.32, transfer g = 0.36, load g = 0.23, across 56 investigations — [Rey et al. 2019 in Noetel et al. 2022](https://doi.org/10.3102/00346543211052329) [O].
- **Modality:** eliminated when learners self-pace, and small after accounting for publication bias — [Noetel et al. 2022](https://doi.org/10.3102/00346543211052329) [O].
- **Pre-training:** the term appears in Noetel only among search terms, and I found no pooled estimate for it there — [Noetel et al. 2022](https://doi.org/10.3102/00346543211052329) [O].
- Animation helps generally, but low prior knowledge learners did not benefit (d = -0.16) in one review — [Noetel et al. 2022](https://doi.org/10.3102/00346543211052329) [O].

### Inferences

- **Contiguity is the top structural rule.** Explanations should sit next to the code they describe, ideally per hunk, not in a separate narrative that forces the reader to hold line numbers in mind. Hover-only explanation may reintroduce a split, so inline or side-by-side is safer. For a developer this may be the highest-value change at zero reader cost.
- **Coherence for developers means no filler.** No motivational intros, no restating of the PR title, no generic AI-explainer prose, no decorative diagrams. Persistent items matter most, so avoid fixed callouts that don't carry information. Expert readers are probably less harmed, but they lose time.
- **Signaling needs restraint.** A clear hierarchy and highlighted lines help, and they probably help the less-experienced reader most. Heavy guidance may not help experts, so keep it structural (headings, diff highlights, risk markers).
- **Segment by change, not by file.** One idea, one screen-sized section, with a named purpose, and the reader controlling progress. A long page already gives learner pacing, so a stepper is not required.
- **Ignore narration.** The modality principle disappears under self-pacing.
- **Pre-training equivalent:** a short glossary of the two or three terms needed, collapsed if the diagnostic shows they are known. Justify it by expertise reversal and load theory, not by a Mayer effect size.
- **Complexity concentrates the value.** Design principles matter most for high element-interactivity material, so polish the concurrency section, not the rename section.

### Gaps

- A coherence meta-analysis was only available through Noetel's tabulation. Mayer's own pre-training evidence was not retrieved.
- Studies mostly concern science lessons and short multimedia, not code. I found no meta-analysis of principles applied to code annotation or diff views.

## Illusion of explanatory depth, fluency and metacomprehension

### Takeaway

This is the central hazard for this product. Clear explanations make understanding feel better without necessarily making it better, explanatory knowledge is the type most prone to that illusion, and unaided judgment of comprehension is barely above chance. What corrects it is attempting to produce something and then seeing the gap. Reading questions with answers does not help.

### Cited Findings

Illusion of explanatory depth:
- People rated their understanding of devices, then wrote an explanation, answered a diagnostic question, and read an expert account. Self-ratings fell significantly after trying to explain (F(4,124) = 38.9 in undergraduates). Ratings rose again after reading the expert account, ruling out general loss of confidence — [Rozenblit & Keil 2002](https://pmc.ncbi.nlm.nih.gov/articles/PMC3062901/) [O].
- It is specific to explanation: mean overconfidence .918 for devices and .860 for natural phenomena, .291 for facts, with procedures and narratives showing little or no drop — [Rozenblit & Keil 2002](https://pmc.ncbi.nlm.nih.gov/articles/PMC3062901/) [O].
- Proposed causes: confusing what is available in the environment with what is held in the head; confusing higher-level function with lower-level mechanism; confusing labels for parts with understanding of how they interact; and indeterminate end states with little practice in giving explanations — [Rozenblit & Keil 2002](https://pmc.ncbi.nlm.nih.gov/articles/PMC3062901/) [O].
- A warning before rating reduced the drop but did not remove it — [Rozenblit & Keil 2002](https://pmc.ncbi.nlm.nih.gov/articles/PMC3062901/) [O].
- Reflecting on how well one could explain, without writing an explanation, also lowered overconfidence, though less so for simpler objects — [Johnson, Murphy & Messer via BPS](https://www.bps.org.uk/research-digest/most-us-are-overconfident-about-how-much-we-understand-things-simple-intervention) [S].
- Explaining one item lowers perceived knowledge of unexplained items too, even more so, which the authors read as possible overgeneralization — [Wilson & Marsh 2024](https://escholarship.org/content/qt2w30c243/qt2w30c243.pdf?t=sgrhye) [A]. Reassessment is not the same as accurate calibration.

AI-sourced explanations:
- Between-subjects experiment with university students (102 collected, 10 excluded): one group consulted ChatGPT on four topics, one read texts identical to the chatbot's answers without knowing the source, and a control group got nothing. The ChatGPT group overestimated their explanatory ability the most. Coders rated their explanations lower than the reading group's (mean 2.47 vs 2.75, p = .044), and their answers were shorter (about 44 vs 60 words) — [Aslanov, Felmer & Guerra 2026](https://escholarship.org/content/qt8cr599sr/qt8cr599sr.pdf) [O]. A small conference study, with students on general topics and no delay, using a modified procedure rather than the classic one. The paper also cites earlier evidence that seeking explanations online amplifies the illusion (Fisher et al. 2015).

Metacomprehension:
- Correlation between judged and tested comprehension: 0.178 in standard conditions, 0.242 overall (115 studies, 15,889 participants, 502 effects) — [Yang et al. 2023](https://discovery.ucl.ac.uk/10150804/2/Shanks_Mind%20the%20Gap%20Between%20Comprehension%20and%20Metacomprehension_AAM.pdf) [O]. Prinz et al. reported r = .24; Yang argues that figure mixes in intervention conditions — [Prinz et al.](https://www.x-mol.com/paper/1340395789148143616) [A].
- Change in correlation against standard conditions — [Yang et al. 2023](https://discovery.ucl.ac.uk/10150804/2/Shanks_Mind%20the%20Gap%20Between%20Comprehension%20and%20Metacomprehension_AAM.pdf) [O]:

| Intervention | Change in accuracy | Significant? |
|---|---|---|
| Delayed summary writing | +0.210 | Yes |
| Delayed keyword generation | +0.184 | Yes |
| Self-explaining | +0.179 | Yes |
| Practice tests | +0.169 | Yes |
| Letter deletion | +0.112 | Yes |
| Test expectancy consistent with test | +0.090 | Yes |
| Rereading after short delay | +0.063 | Yes, small |
| Immediate summary | +0.030 | No |
| Immediate keywords | +0.009 | No |
| Question generation | +0.042 | No |
| Reading questions and answers | n.s. | No |
| Analogy provision | n.s. | No |
| Keyword reading | -0.096 | Borderline worse |

- Combining interventions tended to be additive — [Yang et al. 2023](https://discovery.ucl.ac.uk/10150804/2/Shanks_Mind%20the%20Gap%20Between%20Comprehension%20and%20Metacomprehension_AAM.pdf) [O].
- Prinz et al.'s situation-model interventions gave g = 0.46 on relative accuracy (28 effects, 2,236 participants) — [Prinz, Golke & Wittwer 2020](https://link.springer.com/article/10.1007/s10648-020-09558-6) [A].
- Analogies make texts feel easier and more interesting and may increase reliance on familiarity; Jaeger & Wiley's paper is titled "Reading an analogy can cause the illusion of comprehension" — [Yang et al. 2023](https://discovery.ucl.ac.uk/10150804/2/Shanks_Mind%20the%20Gap%20Between%20Comprehension%20and%20Metacomprehension_AAM.pdf) [O].
- Better monitoring matters: delayed keywords raised judgment accuracy to G = 0.70 vs 0.29 and 0.37, and led readers to restudy the texts they had understood worst — [Thiede et al. 2003 in Yang et al. 2023](https://discovery.ucl.ac.uk/10150804/2/Shanks_Mind%20the%20Gap%20Between%20Comprehension%20and%20Metacomprehension_AAM.pdf) [O].

Fluency:
- Randomized crossover at Harvard, N = 149: active instruction scored 0.46 SD higher on a test of learning but 0.56 SD lower on feeling of learning, with identical slides and handouts. Instructor fluency predicted feeling of learning (about 0.51 SD), and format stopped being significant once fluency was included. Students read effort as a sign of poor learning — [Deslauriers et al. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6765278/) [O]. The explanations are partly correlational; 17 interviews; one site, two topics.
- Disfluency as a fix: Xie et al. 2018 pooled 39 experiments and reported d = 0.01 — [as reported in an HSE working paper](https://wp.hse.ru/data/2021/11/10/1458461373/127PSY2021.pdf) [S]. That meta-analysis was criticised for errors and poor reproducibility — [Educational Psychology Review critique](https://link.springer.com/article/10.1007/s10648-020-09579-1) [A]. A pre-registered direct replication (N = 96) also found null results — [replication](https://link.springer.com/10.1007/s11409-023-09366-7) [A]. The field remains contested, with no reliable benefit shown.

Replication status:
- I found no formal direct replication of the original twelve-study Rozenblit & Keil set. The paradigm has been reused in related work — [BPS digest](https://www.bps.org.uk/research-digest/most-us-are-overconfident-about-how-much-we-understand-things-simple-intervention) [S]. Treat the pattern as well supported in kind, with the exact sizes uncertain.

### Inferences

- **A well-written explanation of a code change is close to a worst-case illusion generator.** It concerns mechanisms (the most illusion-prone knowledge), it uses labels that feel understood, it keeps the environment one click away, and it reads smoothly. A polished AI-written page could lower review quality while raising confidence. This is an inference, and the report should treat it as a hypothesis worth measuring. Aslanov 2026 gives early support: the same text produced worse outcomes when obtained from a chatbot than when simply read. That suggests the harm lies partly in how the explanation is obtained and attributed, not only in the text. A document read in a viewer is closer to the "read" condition, but its reader knows it is AI-written, which the study did not test.
- **The rule that follows: ask for production before revealing.** A check with a hidden answer is informative; a question shown with its answer is not. FAQ-style sections are close to useless for calibration and may even feel reassuring. Never show worked "questions a reviewer might ask" with answers already open.
- **Delay beats immediacy.** A summary or keyword exercise right after a passage doesn't help monitoring; after intervening material, it does. So put the understanding check at some distance from the section it covers. The final check should span earlier sections rather than repeat the last one, for example, "Without scrolling up, what are the two conditions that trigger the fallback?"
- **"In your own words, what did this change do?"** near the end is a delayed summary, the best single monitoring intervention in the table. Readers won't type much, so use one line or a mental attempt with a reveal. The app can store nothing and still do its job.
- **Use feedback that names the gap.** After a miss, point to the exact lines and let the reader revisit. Thiede's result shows that better monitoring only pays when there is a way to act on it. A link back to the relevant hunk is the regulation step. Offer "Re-open what I got wrong" at the end.
- **Set the right expectation early.** Consistent test expectancy improved accuracy. Stating up front "you'll be asked what happens when the cache misses" costs nothing, and it pairs with prequestions.
- **Be careful with analogies.** Keep them for readers lacking context, and always follow them with the literal mechanism. Don't add them to feel friendly.
- **Don't add friction by form.** No odd fonts or hidden text. Effort should come from thinking tasks, not from poor legibility, and the evidence for disfluency is at best contested.
- **Prepare for low ratings.** Deslauriers implies readers may rate an active document as worse than a smooth one even when they learn more. If the app ever collects "was this helpful?", that signal may reward the wrong design. Measure with outcomes such as defects caught or check accuracy.
- **Don't say "you understood this".** After checks, report which parts were answered and which missed, not a pass mark.

### Gaps

- Metacomprehension evidence uses students and expository texts judged in batches. Whether it applies when a professional judges "did I understand this diff?" is unknown, though expertise may help or may worsen overconfidence.
- I found no study of the illusion of explanatory depth specifically for code. For AI explanations I found one small study (Aslanov 2026), not yet replicated as far as I know. A parallel note in this folder, ai_explanation_trust.md, covers adjacent ground.
- Immediate generative tasks were tested in multi-text paradigms. How much "delay" a single 15-minute document can create is unknown.
- Evidence on confidence ratings, hypercorrection of high-confidence errors and confidence-weighted testing was on my list but could not be searched before the budget ran out.

## Evidence from programming education

### Takeaway

Computing education offers useful question formats, especially tracing and "explain in plain English", and a clear warning about passive visualization. Almost all of it concerns introductory students, so it provides good item types but weak claims about professionals. Parsons problems are a poor fit.

### Cited Findings

Reading, tracing and writing:
- Lopez et al. 2008 reported a hierarchy: tracing precedes reading, reading precedes writing. Tracing alone explained about 15% of the variance in writing; tracing plus explaining about 46% in a data-structures study — [Mining Hierarchies paper](https://arxiv.org/pdf/2410.12967), [replication paper](https://par.nsf.gov/servlets/purl/10340072) [A]. Lister et al. 2009 and others replicated the pattern, including in Python. Later work raised methodological concerns, and the hierarchy is not the only one that fits correlational data — [Mining Hierarchies](https://arxiv.org/pdf/2410.12967) [A].
- Xie et al. 2019 propose teaching skills in order, reading before writing and semantics before templates. Exploratory, mixed-methods evidence showed better completion rates and error rates — [Xie et al. 2019 record](https://katalog.lib.cas.cz/KNAV/EdsRecord/edb,136709403), [synopsis](https://synapsesocial.com/papers/W2912010641) [A].

Explain in plain English:
- A 7-point rubric reached Krippendorff's alpha .775 and internal consistency .954. EiPE scores correlated r = 0.555 with code writing in a course of 452 — [Chen et al. 2020](https://zilles.web.engr.illinois.edu/papers/EiPE_rubric_sigcse_2020.pdf) [A].
- EiPE distinguishes relational answers (what the code does overall) from multi-structural ones (line-by-line narration). Students unable to explain relationally early on tend to struggle at writing later. Adoption is limited by grading effort — [Fowler et al. 2021](https://zilles.web.engr.illinois.edu/papers/how_to_eipe_icer_2021.pdf) [O].
- Alternatives: asking for a function name as a proxy for comprehension. Items discriminated well between students, and most responses were relational, in one course with four snippets. Vague names could be wrongly accepted because GPT-4o could guess the intended function, and stricter grading reduced those false positives — [Function naming paper 2025](https://arxiv.org/html/2503.12207v1) [O]. It cites prior work that expressing ideas clearly in English can be hard for some students, so open-text prompts may measure language as well as comprehension when English is the reader's second language.

Parsons problems:
- A 2020 review found the effectiveness of Parsons problems remains uncertain owing to too little replicated research — [Du et al. 2020 abstract](https://www.aminer.org/pub/5e315ae33a55ac2563896aed/a-review-of-research-on-parsons-problems) [A]. The larger 2022 working group reviewed and proposed study designs — [Ericson et al. 2022](https://researchr.org/publication/EricsonDP0H0MMP22a/bibtex) [A].
- Students learned as much as from fixing or writing code, in significantly less time — [Georgia Tech dissertation summary](https://hg.gatech.edu/node/603172), [as described in Proof Blocks paper](https://arxiv.org/pdf/2211.09609) [S].

Subgoal labels:
- Labelled worked examples produced medium and small effects on some exam totals, in introductory programming. One study found a positive effect on overall course performance without a statistically better average exam score — [Morrison, Margulieux & Decker slides](https://www.raspberrypi.org/app/uploads/2020/07/Using-subgoal-labels-to-reduce-cognitive-load-in-introductory-programming.pdf) [O]. Slides by the method's authors, not a peer-reviewed synthesis.

Active use of visualization: see Hundhausen in the worked-examples section.

Code review reality:
- Ten experienced reviewers on 25 real reviews built a mental model of the change as an extension of the system, then compared expected and ideal solutions against the implementation, using opportunistic strategies after a context-building phase — [Gonçalves et al. 2025](https://arxiv.org/abs/2503.21455) [A]. Observational; not a learning experiment.

### Inferences

- **Tracing questions are the natural retrieval item for code.** "Given this input, what does the function return now?" is objectively checkable, application-level, cheap to generate, and verifiable by actually running the code. That last point is a real advantage: the skill can execute the code to confirm the answer key, which should reduce wrong keys.
- **Use EiPE as a one-question test of the whole change.** "In one sentence, what does this change do, ignoring how?" Compare with the model answer. The relational vs multi-structural distinction is a useful rubric for reader and generator: the model answer must be relational. It also suggests a critique of AI summaries, which often narrate line by line.
- **Function-naming is a neat cheap proxy.** "What would you name the new behaviour?" with three candidates is easy to answer, though it risks being a recognition task.
- **Skip Parsons in general.** Reassembling code a reader is reviewing is a teaching exercise for syntax and structure, not review. The one defensible variant is ordering runtime events, such as "put these steps of the new request flow in order", which is closer to tracing than to Parsons.
- **Subgoal labels are generator work.** Naming chunks of a change by purpose ("validate input", "commit state") costs the reader nothing, and reasonably extends to hunks. Evidence is small and novice-based, so adopt it on load-theory grounds only.
- **Support the reviewer's actual workflow.** Reviewers form expectations and then compare. That fits a prompt to "state what you would expect the change to do", then show the actual change. It is an existing behaviour rather than an imposed test, and it may be the most acceptable form of prediction for professionals.
- **Do not transfer the numbers.** A correlation with code writing in a data-structures course says little about a senior engineer. Use these as item formats, not as effect estimates.

### Gaps

- I could not gather the misconceptions literature (for example, a systematic review of student misconceptions, or notional-machine work), or the doer effect from interactive courseware, because the web search budget ran out at the end of this research. These should not be assumed absent from the literature; they are unexamined here.
- I found no learning-science evidence for experienced developers, and no comprehension-check research on code review or AI-written code from a learning perspective. Work in software engineering on comprehension should be taken from the adjacent notes in this folder.
- The Lopez, Lister, Parsons and EiPE results here come largely from abstracts, snippets and citing papers rather than from reading each original.
- Morrison, Margulieux & Guzdial's ICER 2015 subgoal study appeared mixed in a search snippet, with an odd result for provided labels under contextual transfer. I could not confirm its direction or size, so it is not cited as a finding.
