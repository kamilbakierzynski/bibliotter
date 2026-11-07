# Interactive articles and explorable explanations: what evidence supports for an explanation of a code change

Scope: evidence on interactive explanation, read against the html-docs-app constraints (self-contained HTML, 5-20 minute read, agent-authored from a component library, must stay searchable). No study found here tests professional developers reading an explanation of a diff, so every step from these findings to that setting is an extrapolation. Treat each one that way.

How far each source was verified:
- **[full]** means the primary text was opened and the figures were read directly.
- **[abstract]** means only the abstract or the publisher record was read.
- **[secondary]** means the claim comes from a search excerpt or another paper's description. Check it before quoting.
- **[product]** means it was checked in this repository's source code.

The session's shared web search budget ran out before the end. Topics that could not be searched are listed under Gaps rather than filled in from memory.

## Hohman et al. 2020, "Communicating with Interactive Articles": what does the review find?

### Takeaway
It is a conceptual overview, not a systematic review, and it says plainly that interactive articles have had little empirical evaluation. Its firm evidence concerns learning mechanisms (self-explanation, testing, prediction, segmentation), not the interactive format as such. It treats production cost as the main practical barrier.

### Cited Findings
- The paper draws on a corpus of more than sixty interactive articles plus research from education, HCI, visualization and journalism. It reports almost no new quantitative results and relies on evidence from other studies — [Hohman et al. 2020](https://distill.pub/2020/communicating-with-interactive-articles/) [full, via a page summary]
- It claims interactive articles have been shown to be more engaging and can help recall and learning. It also says little is actually known about them, that empirical evaluation is limited, and that more research is needed to learn when interactivity repays its cost — [Hohman et al. 2020](https://distill.pub/2020/communicating-with-interactive-articles/)
- Its better-supported items are mechanisms:
  - self-explanation (Chi et al. 1989)
  - the testing effect, strengthened by feedback (Roediger & Karpicke 2006)
  - visualising one's own predictions (Kim et al. 2017)
  - personalisation (Cordova & Lepper 1996)
  - segmentation of material

  Source: [Hohman et al. 2020](https://distill.pub/2020/communicating-with-interactive-articles/)
- It marks these as contested or weak:
  - animation versus good static graphics (debated)
  - scrollytelling versus slideshows (mixed)
  - social comparison of predictions (inconclusive)
  - person-shaped unit glyphs (no added empathy)

  Source: [Hohman et al. 2020](https://distill.pub/2020/communicating-with-interactive-articles/)
- On costs, it says a good interactive article is closer to building a website than writing a post, and it often takes longer than a paper. Time spent on one graphic comes out of the text or the site design. Web technology also rots, and accessibility remains an open problem — [Hohman et al. 2020](https://distill.pub/2020/communicating-with-interactive-articles/)
- It warns that the New York Times remark about few readers interacting has hardened into a rule of thumb that can push designers toward a worse presentation. It adds that readers, mobile ones included, want interactivity when it is central to the message — [Hohman et al. 2020](https://distill.pub/2020/communicating-with-interactive-articles/)

### Inferences
- A correct summary is that specific cognitive acts help, and interactive articles can host those acts. "Hohman shows interactive articles work" overstates the paper.
- A ready-made component library attacks the cost the paper treats as dominant. It also forces a discipline the paper implies but does not state: each interaction competes with time that could improve the prose.

### Gaps
- The paper gives no effect sizes, and its claim that readers want central interactivity could not be traced to a specific study here.

## Do readers actually use interactive elements?

### Takeaway
On the public web most readers do not touch optional controls, but the evidence is thinner than folklore suggests. The only traceable figure is about 85% not clicking a prominent button on a couple of NYT graphics. Tse's slides contain no statistics at all. Use rises sharply when the reader has a stake or the activity is assigned, which is closer to a code reviewer's position, though no study measures that population.

### Cited Findings
- Archie Tse's 2016 slides are the primary source for "Readers just want to scroll." They say steppers, tabs and sliders were mostly a way to show more material, and that readers were not reaching all of it. The deck has **no statistics** — [Tse 2016 slides](https://raw.githubusercontent.com/archietse/malofiej-2016/master/tse-malofiej-2016-slides.pdf) [full]
- Tse's three rules are:
  - anything beyond scrolling must pay off spectacularly
  - assume nobody sees a tooltip, so do not hide important content
  - multi-platform interactivity is expensive

  The reported consequences at the Times were mostly static visuals, more written text, motion triggered by scroll, and a very high bar for interactives — [Tse 2016 slides](https://raw.githubusercontent.com/archietse/malofiej-2016/master/tse-malofiej-2016-slides.pdf) [full]
- The widely repeated 85% traces to Gregor Aisch's own 2015 measurement on a couple of NYT graphics, where about 85% of readers did not click a prominent button. Aisch stresses that not clicking is not the same as ignoring the graphic — [Aisch 2017](https://vis4.net/blog/in-defense-of-interactive-graphics/) [full, via a page summary]
- Aisch's rule is that essential content must never sit behind a click or hover, while non-essential content can. His cases for optional interaction are that tooltips drew fact-checkers, that hidden paging gave access to a full dataset, and that a delegate calculator made the analysis transparent and built trust — [Aisch 2017](https://vis4.net/blog/in-defense-of-interactive-graphics/)
- The "10-15%" formulation in the brief was not found in any source. Aisch's figure implies roughly 15% clicking, on a few graphics only — [Aisch 2017](https://vis4.net/blog/in-defense-of-interactive-graphics/); not in [Tse's slides](https://raw.githubusercontent.com/archietse/malofiej-2016/master/tse-malofiej-2016-slides.pdf)
- Conlen, Kale and Heer instrumented three Idyll articles, collected more than 50,000 sessions, compared desktop and mobile, found patterns that recur across articles, and released the data. The source summary mentions the existence of these results but gives none of the rates — [Conlen et al. 2019](https://idl.uw.edu/papers/idyll-analytics) [abstract]
- Boy, Détienne and Fekete ran three web field experiments on a news outlet and a visualisation gallery. Contrary to their hypothesis, adding an introductory story did not appear to increase engagement in exploration — [Boy et al. 2015](https://researchportal.ip-paris.fr/en/publications/storytelling-in-information-visualizations-does-it-engage-users-t/) [abstract]
- Boy et al. then tested three cues suggesting interactivity on bar charts embedded in text. Only one got people to interact, and the authors attribute that to its feedforward, meaning it showed what interacting would do — [Boy et al. 2016](https://hal-univ-tlse3.archives-ouvertes.fr/INRIA/hal-01188973) [abstract]
- Tversky et al. note that animations cost extra time, are not universally preferred, and are often not used — [Tversky et al. 2002](https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf) [full]
- In assigned course contexts use is high. zyBooks reports 98% of students completing at least some activities and an average of 87% of assigned activities. This is vendor-authored research — [zyBooks three-university study](https://www.zybooks.com/?p=10341) [secondary]
- Voluntary spaced-review use is much lower. In the default 2021 Quantum Country condition about 10,081 readers registered, about 21% finished the embedded questions (103+ of 112), and about 47% of those completed a first review — [Matuschak note](https://notes.andymatuschak.org/zHpcCdrZKdikcoaHUScGgP6) [secondary: search excerpt only; a direct fetch returned 404]

### Inferences
- Design for zero clicks. The document must make its full argument at zero interactions, with interaction as an optional layer. This holds for a motivated reviewer too, who is short on time rather than uninterested.
- The folk claim "nobody clicks" is also overextended, since it rests on news readers with no stake. A reviewer deciding whether to approve a change has a reason to probe a specific doubt, which matches Aisch's fact-checker case. This is plausible but untested.
- A control should show what it will do before it is used (Boy 2016). "Show the failing input" beats an unlabelled slider.
- The app is positioned to fill this evidence gap. Local logging of step clicks, reveal opens and detail opens, in the spirit of Conlen's instrumentation, would produce the only reviewer data that exists.

### Gaps
- Interaction and scroll rates in Conlen et al. were not obtained, because the PDF and the dissertation exceed the fetch size limit. The session logs are public at the [data link on the paper page](https://idl.uw.edu/papers/idyll-analytics).
- Exact interaction percentages in Boy et al. 2015 were not obtained, because HAL blocked automated access.
- Dominikus Baur's 2017 post could not be read (HTTP 403).
- No data exists on how code reviewers use interactive explanations.

## Controlled studies: when does interaction beat a static figure, and what do animation studies show?

### Takeaway
Animation has a small average advantage that appears mainly when the change over time is itself what must be learned. Most comparisons find no difference. Interactivity as such has no general evidence. The reliable gains come from making the reader do something effortful, such as predicting or explaining. Liking, ease and engagement regularly rise without learning, and sometimes alongside a false sense of understanding.

### Cited Findings
- Tversky, Morrison and Bétrancourt found that claimed animation wins tended to dissolve on inspection. The animated condition carried more information or included interactivity or prediction, so the comparison was not equivalent — [Tversky et al. 2002](https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf) [full]
- **Congruence principle:** the structure and content of a graphic should match the structure and content of the mental representation wanted. Routes are thought of as turns, so draw turns. **Apprehension principle:** the graphic must be readily and accurately perceived and understood — [Tversky et al. 2002](https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf) [full]
- The same paper says animations are often too complex or fast, that continuous events are conceived as discrete steps, that animation should lean schematic, and that arrows in static diagrams can convey sequence. It suggests stop, start and replay may help but says the proper experiments had not been run — [Tversky et al. 2002](https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf) [full]
- Höffler and Leutner reported d = 0.37 from 76 comparisons in 26 studies, 1973-2003 — [cited in Berney & Bétrancourt 2016](https://access.archive-ouverte.unige.ch/access/metadata/75bf6876-cb91-4e2c-8ac6-9d0767449449/download) [full]
- Berney and Bétrancourt updated this to g = 0.226 (95% CI 0.12-0.33) from 140 comparisons and 7,036 participants. Animation won 30.7% of comparisons, static won 10%, and 59.3% found no significant difference — [Berney & Bétrancourt 2016](https://access.archive-ouverte.unige.ch/access/metadata/75bf6876-cb91-4e2c-8ac6-9d0767449449/download) [full]
- A surprising moderator result from that analysis: animation's advantage was significant only when **system-paced** (g = 0.309), and the three levels of learner control were not significant. Narration gave g = 0.336 and no accompanying text gave g = 0.883. Cueing did not moderate the effect. The authors expect pacing to interact with other factors — [Berney & Bétrancourt 2016](https://access.archive-ouverte.unige.ch/access/metadata/75bf6876-cb91-4e2c-8ac6-9d0767449449/download) [full]
- Ploetzner et al. re-analysed by what had to be learned. Animation won when simple (g = 0.340) or complex (g = 0.647) features of the change had to be learned, and made no difference when they did not (g = 0.043) — [Ploetzner et al. 2021](https://link.springer.com/article/10.1007/s11251-021-09541-w) [secondary]
- Segmenting: 56 investigations and 88 comparisons show small-to-medium gains for retention and transfer, also when system-paced, with lower cognitive load and more learning time. Learners with high prior knowledge gained more on retention — [Rey et al. 2019](https://www.doi.org/10.1007/S10648-018-9456-4) [abstract]
- Robertson et al. compared animation, overlaid traces and small multiples:
  - For analysis, animation averaged 83.1 s against 45.7 s (small multiples) and 55.0 s (traces), and small multiples was more accurate than animation.
  - For presentation, animation was quickest (15.8 s against 25.3 s and 27.8 s) but produced many errors.
  - Participants rated animation most enjoyable (about 4.6-5.0 on a 0-6 scale) while also agreeing they lost track of data points (about 4.8).

  Source: [Robertson et al. 2008](https://faculty.cc.gatech.edu/~stasko/papers/infovis08-anim.pdf) [full]
- Paik and Schraw report that representational animation hurt learning, directive animation helped, and both induced an illusion of understanding — [abstract reproduced on a blog](https://www.philippinesbasiceducation.us/2013/06/animation-illusion-of-understanding.html) [secondary]
- exploRNN compared an interactive explorable with a text environment (n = 37, between subjects):
  - text won on recall (p = .028)
  - comprehension and transfer did not differ significantly
  - extraneous load was lower for the interactive version, and it was liked more

  The authors raise the illusion of knowing as a possible explanation — [Bäuerle et al.](https://arxiv.org/pdf/2012.06326) [full]
- A review of interactive e-texts reports generally better learning than control texts, but also one significant negative result, one no-benefit result, and overconfidence among interactive readers — [UND Scholarly Commons](https://commons.und.edu/cgi/viewcontent.cgi?article=1064&context=ehb-fac) [secondary; direct fetch blocked, authorship unverified]
- Kim, Reinecke and Hullman (n = 378, 42 per condition) asked readers to predict data, explain it, or both. Recall error fell by 4.08 points (predict and explain), 3.54 (predict with feedback), 3.52 (explain only) and 2.30 (predict only) on a 0-100 scale. Trend recall improved only for predict-explain and predict-feedback. Completion time did not differ across conditions (mean 19.4 min). Effects persisted with moderate or low prior knowledge — [Kim et al. 2017](https://mucollective.northwestern.edu/files/2017-ExplainingTheGap-CHI.pdf) [full]
- In the same study, visual conditions had 3.76 points (36%) more recall error than text conditions overall — [Kim et al. 2017](https://mucollective.northwestern.edu/files/2017-ExplainingTheGap-CHI.pdf) [full]
- Koedinger et al. estimated that one standard deviation more doing is associated with over six times the gain of extra watching or reading in a MOOC. The data is correlational with causal-inference methods — [CMU press release](https://www.eurekalert.org/news-releases/873722) [secondary]
- Seductive details hurt: g = -0.33 across 68 effects in 58 studies — [umbrella summary](https://www.qic-wd.org/sites/default/files/Umbrella%20Summary%20-%20Seductive%20Details%20in%20Training%20041821.pdf) [secondary]. A 2026 meta-analysis of 50 studies reports a smaller g = -0.16 — [EurekAlert](https://www.eurekalert.org/news-releases/1127304) [secondary]
- ICAP predicts learning rises from passive through active and constructive to interactive engagement — [Chi & Wylie 2014](https://informahealthcare.com/doi/full/10.1080/00461520.2014.965823) [abstract]. Critics object that it classifies by overt behaviour and conflicts with cognitive load predictions for learners without schemas — [arXiv 2408.13364](https://arxiv.org/pdf/2408.13364) [secondary]

### Inferences
- A usable test for any proposed interaction has three questions. Is the change over time what the reader must learn? Does the reader have to generate something? Does it reveal information not otherwise available? If all three answers are no, the interaction is decoration.
- "Add a play button" has no support, and the pacing evidence does not favour reader control as such. That is still no argument for autoplay here: the Berney result comes from short instructional animations, while a reviewer needs to stop and read. Discrete steps are the safer reading of Tversky and Rey.
- Prediction is unusually cheap. It added no measurable time in Kim et al.
- With short reading time, the coherence cost of extra material should weigh heavily. Rey (2012) is reported as finding seductive-detail harm stronger under limited study time — [later article citing Rey](https://link.springer.com/article/10.1007/s11251-023-09632-w) [secondary]
- An explanation that feels easy is not evidence of understanding, which is also a risk for AI-written explanation. A check question gives the reader a way to detect this.

### Gaps
- No controlled evaluation was found of a well-known explorable against a good static version with professional adults.
- Could not be verified before the search budget ran out: D'Angelo et al. 2014 on simulations, Kirschner, Sweller and Clark 2006 on minimal guidance, the testing-effect meta-analyses (Rowland 2014, Adesope et al. 2017), Bisra et al. 2018 on self-explanation, and Schroeder & Cenkci 2018 on spatial contiguity. Do not cite effect sizes for these from these notes.

## Scrollytelling, steppers and free scrolling: comprehension and preference

### Takeaway
There is no robust comprehension or engagement difference between steppers and scrollers, and preference is split. One study favours slideshow layout for comprehension. Bidirectional linking of text and visualisation is the most actionable result. Nothing here justifies building scroll-bound behaviour.

### Cited Findings
- McKenna et al. analysed 80 stories and ran three studies on one machine learning story. These were a lab study (n = 8), interviews (n = 10) and a crowd study (n = 240) — [McKenna et al. 2017](https://users.cs.utah.edu/~miriah/publications/narrative-flow.pdf) [full]
- Preference flipped between studies. In the first, 3 of 8 preferred the stepper and 5 of 8 the scroller (SUS 62 and 60). In the second, 2 of 10 preferred the stepper and 8 of 10 the scroller, two of those weakly (SUS 76 and 80) — [McKenna et al. 2017](https://users.cs.utah.edu/~miriah/publications/narrative-flow.pdf) [full]
- In the crowd study visuals and animated transitions raised reader-rated engagement, with small effects. Stepper versus scroller was not significant, and many participants had no preference. Comprehension averaged about 4 of 5 with no major difference across conditions — [McKenna et al. 2017](https://users.cs.utah.edu/~miriah/publications/narrative-flow.pdf) [full]
- Limitations stated by the authors: a single story, conditions that differ on several factors at once, and an engagement questionnaire that may be too coarse. They also warn that laggy or overridden navigation input (scrolljacking) harms the experience — [McKenna et al. 2017](https://users.cs.utah.edu/~miriah/publications/narrative-flow.pdf) [full]
- Zhi, Ottley and Metoyer (n = 180, crowdsourced, 2 × 2 layout by linking) found:
  - slideshow layout improved comprehension
  - within slideshow, linking improved recall over no linking
  - linking significantly increased engagement
  - participants preferred linking and slideshow

  Source: [Zhi et al. 2019](https://profiles.wustl.edu/en/publications/linking-and-layout-exploring-the-integration-of-text-and-visualiz/) [abstract]. The authors caution that results may be specific to the story used — [catalogue summary](https://diglib.eg.org/handle/10.1111/cgf13719) [secondary]
- Both studies were desktop-focused — [Hohman et al. 2020](https://distill.pub/2020/communicating-with-interactive-articles/)
- Tse reports the NYT moving to scroll-triggered motion for reasons of reach and cost — [Tse 2016 slides](https://raw.githubusercontent.com/archietse/malofiej-2016/master/tse-malofiej-2016-slides.pdf) [full]

### Inferences
- Keep the document as a normal scrolling page, with the page's scroll position owned by the browser. Stepped behaviour belongs inside a single figure, not at page level.
- Do not build a scrollytelling engine. It has authoring cost, fragility and a scrolljacking risk, with no comprehension gain to pay for them.
- Linking is the cheapest result to adopt: hovering or clicking a term in the prose highlights the matching node, and the reverse. Treat it as promising rather than proven, since it rests on one study of one story.

### Gaps
- No study uses technical content, developer readers or code. No replication of the slideshow comprehension advantage was found.

## The mnemonic medium: Quantum Country, Orbit, and whether it applies to prose about a system

### Takeaway
Embedded prompts plus spaced review give strong retention among readers who persist, at 35-50% added reading time and with heavy self-selection. Matuschak argues the cost is repaid only for foundational knowledge readers reuse. A one-off diff explanation is the wrong genre for the spaced review. A few in-text retrieval questions are a defensible borrowing, as long as they stay optional and readers can move past them.

### Cited Findings
- Quantum Country's first essay has 112 embedded questions and takes about 4 hours to read. After 6 repetitions, costing about 95 minutes of total review, most users reached about 6,000 days of demonstrated retention, or about 54 days per question — [Matuschak & Nielsen 2019](https://numinous.productions/ttft/) [full, via a page summary]
- Six months after release, 195 users had demonstrated a month of retention on at least 80% of cards — [Matuschak & Nielsen 2019](https://numinous.productions/ttft/)
- An informal delay experiment on 8 cards had 25 delayed users drop from 91% to 87% over two weeks, while 16 regular users rose from 89% to 96%. The authors caution about sample size and duration — [Matuschak & Nielsen 2019](https://numinous.productions/ttft/)
- Late-2019 readers: the median reader had two-week retention on 95%+ of prompts by session 9, and about 24 days per question after 3 repetitions. The author flags survivorship and selection effects and says this data is correlational — [Matuschak note](https://notes.andymatuschak.org/z3kzMVAPanLdwuE4MQYt2ZW3p67Ce57ZVXjwZ) [full]; [causal impact note](https://notes.andymatuschak.org/zuCfBJSkm5BnqC1qw1bLH2) [full]
- After five days of demonstrated retention, per-user accuracy at the 25th/50th/75th percentiles is 89/95/98%, rising to 96/99/100% at four months. For most readers under 2% of repetitions are lapses — [Matuschak note](https://notes.andymatuschak.org/z2Rv4RAjXUrwa3fMYn9Q1iR) [secondary]
- A later randomised analysis found about a 13-point recall gap between 1-week and 2-month first intervals. Hard questions at one month were about 42% with no prompts, 71% with in-essay practice and make-up sessions, and 90% with an added 1-week review. Easy questions were about 89%, 91% and 100%. **The author labels this preliminary and asks that it not be cited or excerpted, so use it for internal judgement and do not carry the figures into a published report** — [Patreon letter, 2022-02-28](https://notes.andymatuschak.org/z93QR51f6HAUPLVDxE6KT1T) [full]
- The added reading cost is stated as 35-50%. Matuschak believes this can be reduced substantially and called scaling premature in 2020 — [Matuschak note](https://notes.andymatuschak.org/zjrts41M36NpjJkj14tTdToSr8gtsWnwQ5A6) [full]
- Stated limits include that users do not write their own cards, that real-world recall is unverified, that it is hard to know what users are actually learning, and that a claim about trivial questions was retracted in December 2019 — [Matuschak & Nielsen 2019](https://numinous.productions/ttft/). Recall rates are also called a misleading proxy for the medium's real goals, and cuing may mask forgetting — [Matuschak notes](https://notes.andymatuschak.org/z2Rv4RAjXUrwa3fMYn9Q1iR) [secondary]
- The medium is said to pay off for platform knowledge, meaning foundations used repeatedly. Typical blog posts are a poor trade because readers do not build on them — [Matuschak note](https://notes.andymatuschak.org/zLgARWxc2xbGQP7LC3s1CSe) [full]
- Whether efficacy generalises to other platform-knowledge topics is an open question and may need domain-specific work on encoding knowledge into prompts — [Matuschak note](https://notes.andymatuschak.org/z8U56PQX9kwhMi97wnQRCByvqXAM4azb9UP6h) [secondary]. A proposed alternative uses prompts for deeper engagement rather than detailed memory — [Matuschak note](https://notes.andymatuschak.org/zSKTbk3MzrCU4Dv9nFUrqS7) [secondary]
- From essays outside its home genre, reports are anecdotal and mixed. Some readers said it made them slow down and read seriously. Others found it stressful or like homework, and a prompt you do not grasp stops you, where text tolerates partial understanding. Prompts are hard to write, and cloze deletions frustrate readers — [Matuschak note](https://notes.andymatuschak.org/ztWkeRtP1VRttCcrGPmDH6trs3vobziJMHT) [full]
- Later notes criticise the early design as rigid and implicitly authoritarian, and argue readers should control which prompts they collect — [Matuschak note](https://notes.andymatuschak.org/z2dofYEWs9Cqu8VDHFHamdNypw83yAZifz53) [secondary]; [reader control note](https://notes.andymatuschak.org/z8kPkXQZ3wVR5DfJ79uhnuz) [secondary]
- Good canonical use requires virtuosic authoring of the prompts as well as the prose — [Matuschak note](https://notes.andymatuschak.org/zGi5kDHJWeKAi2QdPQpNasj) [secondary]

### Inferences
- **Can it apply to prose about a system?** Plausibly for durable knowledge of a codebase (its invariants and architecture), which fits the platform-knowledge definition. No evidence tests this.
- A typical diff is closer to a blog post. Its details decay in value once merged, so spaced review would buy retention of content the reader will not need. Do not build spaced review for v1. If tried later, restrict it to documents about lasting architecture.
- What transfers is single-shot in-text retrieval. This agrees with the prediction and responding evidence elsewhere in these notes.
- Reader-control lessons translate directly. Questions must be skippable, must never block scrolling, and the answer must be one click away.
- The authoring warning matters most for an agent. Generated prompts will drift to trivia unless constrained. Tying each question to a behaviour the diff changes, with a checkable answer, is a mitigation that follows from the above but is untested.

### Gaps
- Orbit's current status could not be established. The notes reviewed date to about 2020-2024, the Orbit note gives no status, and withorbit.com returned only a browser-compatibility message. No 2025-2026 reflection was found.
- Results of the "Quantum Country efficacy RCTs" note could not be opened (404).
- No application to code documentation or engineering prose was found.

## Program visualisation, algorithm animation and engagement

### Takeaway
Hundhausen's finding has held up as the central result: what learners do with a visualisation matters more than what it shows. Evidence for engagement beyond viewing is real but mixed, comes from novices in courses, and sometimes shows engagement rising without measured learning. Support for Python Tutor-style stepping as a cause of learning is thin.

### Cited Findings
- Hundhausen, Douglas and Stasko covered 24 experiments, of which 11 had significant results. Their most significant finding is that how students use the technology has more impact than what it shows them — [Hundhausen et al. 2002](https://faculty.cc.gatech.edu/~stasko/papers/jvlc02.pdf) [full]
- Studies aligned with constructivist theory had the most tests (14) and the best rate (10, or 71%). Epistemic Fidelity, the idea that a better representation transfers knowledge better, predicted only 30% of significant results — [Hundhausen et al. 2002](https://faculty.cc.gatech.edu/~stasko/papers/jvlc02.pdf) [full]
- Effort predicts results. Where activities took equal effort, 6 of 9 studies found no significant difference. Where effort differed, the higher-effort group won in 10 of 14 — [Hundhausen et al. 2002](https://faculty.cc.gatech.edu/~stasko/papers/jvlc02.pdf) [full]
- Example: Lawrence found that students exploring animations with their own input data outscored those watching the same animations on supplied data — [Hundhausen et al. 2002](https://faculty.cc.gatech.edu/~stasko/papers/jvlc02.pdf) [full]
- Citation warning: at least one secondary source says "13 of 28 studies" — [ICCE paper](https://library.apsce.net/index.php/ICCE/article/download/254/223/435). The primary paper says 11 of 24.
- The engagement taxonomy has six levels: no viewing, viewing, responding, changing, constructing and presenting. It was a proposal with a hypothesis that learning rises with level, plus an invitation to test it — [Naps et al. 2002](https://rex.libraries.wsu.edu/esploro/outputs/journalArticle/Exploring-the-role-of-visualization-and/99900547176001842) [abstract]; [level descriptions](https://library.apsce.net/index.php/ICCE/article/download/254/223/435) [secondary]
- Banerjee et al. tested responding against viewing in a CS1 classroom (39 students per group in experiment I):
  - active behavioural engagement was 40% versus 11.67% of observations
  - perceived learning was higher for prediction
  - in experiment I there was no significant difference in post-test or problem-solving rate
  - problem-solving rate favoured prediction only among students with prior training in active learning

  Source: [Banerjee et al. 2015](https://rptel.apsce.net/index.php/RPTEL/article/download/2015-10015/190/583) [full for these figures]
- That paper also lists studies finding no difference across engagement levels, such as Stasko et al. 1993, alongside positive ones, such as Laakso et al. 2009 for changing over viewing — [Banerjee et al. 2015](https://rptel.apsce.net/index.php/RPTEL/article/download/2015-10015/190/583) [full]
- Urquiza-Fuentes and Velázquez-Iturbide reviewed 18 systems and 33 evaluations. About half of the systems had only shallow usability checks. Script-based systems suit viewing, responding and changing, while compiler-based systems suit constructing and presenting — [2009 survey](https://burjcdigital.urjc.es/items/609ccf16-35cc-0c23-e053-6f19a8c0ba23/full) [abstract]
- Sorva et al. conclude that evaluations generally support program visualisation for beginners, but that research does not yet allow nuanced conclusions about engagement. Most systems were short-lived prototypes — [Sorva et al. 2013](https://www.doi.org/10.1145/2490822) [abstract]
- Python Tutor evidence found:
  - a survey-based positive evaluation — [Karnalim & Ayub 2017](https://doaj.org/article/c55fb714fa4e4110bd9206f4312df85b) [secondary]
  - a small crossover classroom study — [UNIMAS](https://ir.unimas.my/id/eprint/36462/) [secondary]
  - think-aloud work showing novices struggle with its visual components and unexplained terms — [UIUC thesis 2024](https://www.ideals.illinois.edu/items/131536) [secondary]

  No large randomised trial was found.

### Inferences
- A Next button is low effort. It gives controlled viewing rather than the responding level, and the effort result says that should not be expected to help much. Adding a prediction at one step of a trace is the cheapest way up the ladder.
- The changing level (reader-supplied input) has the Lawrence support but requires an executable model. Agent-generated documents should approximate it with precomputed scenarios, accepting that this removes some of the effort that made it work.
- Engagement is not a proxy for learning. Banerjee's first experiment shows engagement and perceived learning rising with no measured gain, so any evaluation of this product should test understanding, not clicks.
- All of this comes from novices learning concepts. A professional reading a change wants a situation model of one system, so direction may carry over better than magnitude. Rey's finding on prior knowledge and Störrle's on experts point in different directions, which suggests caution about either.

### Gaps
- Python Tutor usage statistics, Guo's own design reflections and Ericson's Runestone usage data could not be verified after the search budget ran out.
- Sorva's full tables were not read because the PDF exceeds the fetch limit.
- No studies of step-through visualisation for professional comprehension of changes were found.

## Diagram families, before/after comparison, small multiples, toy data, concrete and abstract examples

### Takeaway
Diagrams help conditionally. Abstraction level, size and layout matter, and the UML evidence is mixed. Small multiples beat animation for analysis. The claim that concrete examples hurt transfer has been substantially weakened. Going concrete first and then generalising is reasonable but rests on small education studies. Direct evidence on toy data in code explanations was not found.

### Cited Findings
- A meta-analysis of 12 controlled experiments (333 observations) found UML effects on code comprehension run in **two opposite directions**. Analysis-phase models may reduce comprehensibility and add time, while design-phase models improve it — [Scanniello et al. 2018](https://link.springer.com/article/10.1007/s10664-017-9591-4) [abstract]
- Störrle re-analysed 78 participants and over 1,200 measurements on class, sequence and state machine or interaction diagrams. He found a strong negative correlation between diagram size and modeller performance. Layout quality matters more as size grows, and small diagrams are easy regardless. He derives a recommendation of about 20-60 diagram elements, with average modellers answering about half of questions correctly in that range — [Störrle 2014](https://backend.orbit.dtu.dk/ws/files/120654649/VL_4d_Size.pdf) [full]
- Layout quality has a notable effect on cognitive load — [Störrle 2011](https://orbit.dtu.dk/en/publications/on-the-impact-of-layout-quality-to-understanding-uml-diagrams/) [abstract]. A follow-up reports no difference in layout benefit across diagram types and less benefit for experts — [Störrle publications](https://dtu.academia.edu/HaraldStoerrle) [secondary]
- Störrle's survey of the field says sequence diagrams have attracted little empirical attention compared with class diagrams. It also says isolated low-level layout criteria (bends, crossings, line length) have little impact alone, and that higher-level qualities such as diagram flow and fit between diagram and intended message seem unstudied — [Störrle 2014](https://backend.orbit.dtu.dk/ws/files/120654649/VL_4d_Size.pdf) [full]
- Developers draw diagrams to explain, design and refactor, but drawings are usually transient and lost — [Cherubini et al. 2007](https://bibtex.github.io/CHI-2007-CherubiniVDK.html) [secondary, with [slides](https://fr.slideshare.net/martigan/lets-go-to-the-whiteboard-how-and-why-software-developers-use-drawings)]
- Comparison designs combine three building blocks: juxtaposition, superposition and explicit encoding of the difference — [Gleicher et al. 2011](https://vivo.colorado.edu/display/pubid_153663) [abstract]
- A review of 127 papers finds terminology inconsistent. It also says the consensus that superposition suits small differences is challenged, since juxtaposition works in some settings — [L'Yi et al. 2020](https://arxiv.org/abs/2009.00192) [abstract]
- Simultaneous viewing and comparison can promote learning more than sequential viewing of the same stimuli (Rittle-Johnson & Star 2011; Son et al. 2011), though not tested within concreteness fading — [Fyfe & Nathan 2019](https://scholarworks.iu.edu/iuswrrest/api/core/bitstreams/2c814639-f4c7-4091-a6eb-5e6e834bc546/content) [full]
- Small multiples: see Robertson et al. in the controlled-studies section — [Robertson et al. 2008](https://faculty.cc.gatech.edu/~stasko/papers/infovis08-anim.pdf) [full]
- Kaminski et al. 2008 found generic abstract instantiations transferred better than concrete ones — [news summary](https://phys.org/news/2008-04-concrete-examples-dont-students-math.pdf) [secondary]
- De Bock et al. partly replicated this and argued the transfer domain was itself abstract — [De Bock et al. 2011](https://nctm.org/Publications/journal-for-research-in-mathematics-education/2011/Vol42/Issue2/Abstract-or-Concrete-Examples-in-Learning-Mathematics_-A-Replication-and-Elaboration-of-Kaminski,-Sloutsky,-and-Heckler_s-Study) [abstract]
- Trninic, Kapur and Sinha attribute the advantage to suboptimal concrete examples. With improved concrete examples, participants did as well or better — [Trninic et al. 2020](https://edrl.berkeley.edu/publications/trninic-d-kapur-m-sinha-t-2020-the-disappearing-advantage-of-abstract-examples-in-learning-math/) [secondary]
- Concreteness fading moves from concrete through iconic to abstract, explicitly linking them. Goldstone and Son found rich-then-generic beat either alone for transfer. In Kaminski's data a two-stage fade lost to generic-only, while McNeil and Fyfe's three-stage version did well. No experiment directly compares two and three stages — [Fyfe & Nathan 2019](https://scholarworks.iu.edu/iuswrrest/api/core/bitstreams/2c814639-f4c7-4091-a6eb-5e6e834bc546/content) [full]
- The approach needs better external validity — [Fyfe & Nathan 2019](https://scholarworks.iu.edu/iuswrrest/api/core/bitstreams/2c814639-f4c7-4091-a6eb-5e6e834bc546/content) [full]. Counter-evidence: constantly concrete representations did at least as well as fading in grades 4-6 science — [Jaakkola & Veermans, as cited](https://www.utupub.fi/items/101ac9b4-f708-4def-816a-78827b0fc696/full) [secondary]

### Inferences
- Match diagram to question, following Congruence:
  - where the change sits: system diagram
  - who calls whom, in what order: sequence diagram
  - how a value is transformed: data-flow diagram

  This is a design inference. No study compares these families for understanding a change.
- Stay well under Störrle's range. A generated diagram should target under about 20 elements, because the 20-60 range still gives only about 50% correct on his tasks. Split larger ones into a set of small views. Generated layout has to be good, or fall back to a small fixed layout, because quality matters more as size grows.
- For before/after, juxtapose the same toy input and encode the difference explicitly. Choose the design for what the reader must judge. Do not animate a before state into an after state for analysis, given Robertson.
- A toy example should be realistic and well chosen. Trninic suggests poor concrete examples, rather than concreteness itself, caused the Kaminski result. The explanation should then state the general rule explicitly, so that the example is not mistaken for the whole behaviour.
- Scanniello's split suggests diagrams should sit close to design-level behaviour and avoid high-level boxes that restate the obvious. This is a cautious analogy only.

### Gaps
- Could not be verified after the search budget ran out: Moody's Physics of Notations, Arisholm et al. 2006 on UML in maintenance, and comparisons of sequence and collaboration diagrams.
- Scanniello's and Fyfe et al. 2014's full texts were not read. The document fetched at the Indiana URL was Fyfe & Nathan 2019.
- No concreteness-fading meta-analysis was found.
- No direct evidence on toy data or small multiples in code explanation was found.

## Progressive disclosure, collapsible details, TL;DR, table of contents, reading depth and skimming

### Takeaway
Readers see a minority of a long page and concentrate on the top. Headings, summaries and an overview have the best support. Collapsing is justified only for content most readers can skip. Most NN/g disclosure advice is expert judgement, not measured results.

### Cited Findings
- Users read at most 28% of words on an average page, and about 20% is more realistic. The basis is 25 instrumented users and 45,237 page views after filtering, with an average page of 593 words. The formula holds for 30-1,250 words, and the data dates from 2005 — [Nielsen, on Weinreich et al.](https://www.nngroup.com/articles/how-little-do-users-read/) [full]
- Viewing time in a 2018 study (120 participants, 130,000+ fixations): 57% above the fold, about 17% on the second screenful, and 74% on the first two. In 2010 above-the-fold viewing was 80% — [NN/g](https://www.nngroup.com/articles/scrolling-and-attention/) [full]
- Chartbeat data for Slate: about 38% bounce, most readers stop near 50% of the article, and only 25% pass pixel 1,600 of 2,000. Across Chartbeat sites the typical stop was about 60%. Even so, about two-thirds of time was below the fold, or 86.2% on Slate — [Manjoo 2013](https://slate.com/technology/2013/06/how-people-read-online-why-you-wont-finish-this-article.html) [full]
- Over 2 billion visits, 55% lasted under 15 seconds of active time. Chartbeat sells analytics, so note the interest — [Gruber on Haile 2014](https://daringfireball.net/linked/2014/03/13/attention-clicks-pageviews) [secondary]
- Layer-cake scanning, fixating on headings and reading under relevant ones, is the most effective scanning pattern. Commitment reading gives best comprehension but is slowest, and chunking helps it too — [NN/g](https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/) [full]
- The F-pattern is the default when a page has little formatting, the user wants efficiency, and interest is low. Antidotes include key points in the first two paragraphs and information-rich heading starts — [NN/g](https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/) [full]
- Summaries beat textbook chapters consistently, at 20 minutes, one week and 6-12 months, on direct questions, inference and transfer, and even when main points in the full text were underlined — [Reder & Anderson 1980](https://vufind.katalog.k.utb.cz/SummonRecord/FETCH-LOGICAL-c364t-607245daa49deb5b5bb1fbd587c3b7275455e754722aa8d9fcd0a00af26eeeb73/Details) [abstract]. Spaced rereading and distraction by details were confounded in that work — [Reder 1982](https://pubmed.ncbi.nlm.nih.gov/7087784) [abstract]
- Overview+detail produced higher essay grades than linear or fisheye readers in a study of 20 subjects. Fisheye was faster, overview+detail took longer on questions, and all but one subject preferred it. Linear was worst on most usability aspects — [Hornbæk & Frøkjær 2001](https://bibtex.github.io/CHI-2001-HornbaekF.html) [abstract]
- Signalling shows d = .38 — [Alpizar et al. 2020](https://rex.libraries.wsu.edu/esploro/outputs/journalArticle/A-meta-analysis-of-signaling-principle-in/99900601052901842) [abstract] — and r = .17 for text-picture relations on transfer, moderated by prior knowledge — [Richter et al. 2016](https://www.bohrium.com/paper-details/signaling-text-picture-relations-in-multimedia-learning-a-comprehensive-meta-analysis/814569585163370497-11949) [abstract]. It did not moderate animation effects in [Berney & Bétrancourt 2016](https://access.archive-ouverte.unige.ch/access/metadata/75bf6876-cb91-4e2c-8ac6-9d0767449449/download).
- NN/g advises two disclosure levels, saying more usually get lost, and stresses that choosing what is initial is the critical step. The article has no quantitative results — [NN/g](https://www.nngroup.com/articles/progressive-disclosure/) [full]
- Accordions suit pages where users need only a few sections, and suit neither uninterrupted reading nor critical content. Allow several open at once, provide expand-all, and write headings that describe the hidden content. Printing needs handling. The article offers expert judgement, not measurement — [NN/g](https://www.nngroup.com/articles/accordions-on-desktop/) [full]
- In-page links help only on long pages, and sticky side tables of contents work on large screens with the current section highlighted. In-page links keep everything visible, whereas accordions hide content. The article cites no quantitative results — [NN/g](https://www.nngroup.com/articles/in-page-links/) [full]
- Product check, in-document find: the viewer's find walks the live DOM, counts visible text, also counts text inside closed `<details>`, and opens the `<details>` on a match. Text hidden any other way (`display:none`, tab panels, inactive slides) is not found — [src/preload/findText.ts](../../src/preload/findText.ts), [src/preload/find.ts](../../src/preload/find.ts) [product]
- Product check, library search: the index strips `<style>`, `<script>`, `<svg>`, `<noscript>`, `<template>` and `<head>` from **static source HTML**. SVG labels and any JS-rendered text are therefore absent from library search — [src/main/classify.ts](../../src/main/classify.ts) [product]
- `hidden="until-found"` exposes content to browser find through a reveal sequence — [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/hidden) [full]. Support is recent — [web-features](https://web-platform-dx.github.io/web-features-explorer/features/hidden-until-found.json) [secondary]

### Inferences
- The first screen is the document. Put the conclusion, risk and reading guide there, not an introduction.
- Assume the reader reads the headings. Each heading should state a claim about the change, because it may be all that gets read.
- Use a sticky overview. Hornbæk supports overview+detail, and it costs no reader effort if ignored.
- Collapse only what most readers skip, and one level deep. Never put the core argument, risks or caveats in a collapsed region.
- **Hard authoring rule from the product checks:** use `<details>` for all collapsible content. Do not build tabs or slides on `display:none`. Every SVG diagram needs a text twin in plain HTML, since otherwise its labels never reach library search. All text must exist in the static source, not be injected by JS.
- `hidden="until-found"` should not be relied on. The viewer's own find uses `checkVisibility`, so it will probably treat such content as hidden. This is inferred from the code and has not been tested.

### Gaps
- No controlled study was found of collapsible details against continuous text for comprehension, and no study of a TL;DR specifically on technical documents.
- Slate and Chartbeat data are 2013 news audiences. Pew's long-form data and Medium's reading-time analyses were not verified.

## Layered depth: stretchtext, levels of detail, reader-selected depth

### Takeaway
This is a long-standing and attractive idea with very little evidence. No controlled comprehension study of stretchtext was found. Per-section optional depth is defensible. A global depth control is not supported, and it would double the authoring work.

### Cited Findings
- Ted Nelson coined stretchtext in 1970 for text that expands or contracts in place, keeping surrounding context, unlike a link that replaces it — [Wikipedia](https://en.wikipedia.org/wiki/Stretchtext) [secondary]
- MetaDoc (Boyle & Encarnacion 1994) used stretchtext with a user model and was applied to technical documentation. Its evaluation was paywalled and not read — [DOI record](https://doi.org/10.1007/BF01142355) [secondary]
- Matuschak's stretchtext note offers only a definition and two examples, with no argument or data — [Matuschak note](https://notes.andymatuschak.org/zPLUdgxrXo5z24ccuyz8YQ4) [full]
- Qlarify offers recursively expandable, LLM-generated abstracts with attribution to source passages. The evaluation had an interview study (N = 9), a deployment (N = 275) and a comparative study (N = 12), and it reports utility for information foraging. It does not measure comprehension in the sources read — [Fok et al. 2024](https://arxiv.org/html/2310.07581v2) [secondary]
- NN/g's limit of two levels — [NN/g](https://www.nngroup.com/articles/progressive-disclosure/) [full] — and overview+detail's advantage — [Hornbæk & Frøkjær 2001](https://bibtex.github.io/CHI-2001-HornbaekF.html) [abstract] — are the nearest evidence.

### Inferences
- Implement depth as `<details>` at the point of need, with an informative summary line. This is stretchtext in its simplest form, costing the agent one extra paragraph rather than a second document.
- Skip a whole-document Brief/Full switch. It needs two consistent versions, adds an agent failure mode, and has no evidence behind it.
- Attribution in Qlarify suggests a useful habit: each expansion should point to the actual lines of the diff, so the reader can verify it.

### Gaps
- The MetaDoc evaluation, Fluid Documents and any controlled comparison of reader-selected depth were not found or read.

## Bret Victor's "Explorable Explanations" and "Up and Down the Ladder of Abstraction"

### Takeaway
These essays are design arguments with demonstrations and no empirical evidence. They are still the best source of ideas for code. Keep moving between a concrete run and the general rule, show the data, and show comparisons. The expensive form, a live model, is unnecessary for most of that value.

### Cited Findings
- The ladder essay frames understanding a system as moving between levels: control a system directly, abstract over time (a whole trajectory instead of one moment), abstract over a parameter (a family of runs), then step back down to a concrete case. It argues that the deepest insight lies in those transitions, and that stepping down matters as much as stepping up. It rests on one toy simulation and offers no study — [Victor 2011](https://worrydream.com/LadderOfAbstraction/) [full, via a page summary]
- It describes systems as having an independent variable, a structure (rules) and data, each of which should be controllable or abstractable — [Victor 2011](https://worrydream.com/LadderOfAbstraction/)
- "Explorable Explanations" proposes reactive documents, explorable examples embedded in the explanation, and contextual information. It claims lower exploration effort makes readers more active and exposes authors' simplifications. Its evidence is demonstrations, and one example is admitted to be made up — [Victor 2011](https://worrydream.com/ExplorableExplanations/) [full, via a page summary]
- A 2024 postscript says the term has been diluted to mean any article with interactive graphics. He intended an argument backed by editable models that readers can use to rebut it — [Victor](https://worrydream.com/ExplorableExplanations/)
- "Learnable Programming" argues code hides what it does, and asks for readable vocabulary in place, visible flow, visible state, showing the data and showing comparisons. It offers no empirical evidence — [Victor 2012](https://worrydream.com/LearnableProgramming/) [full, via a page summary]

### Inferences
- The ladder has a cheap static form for a diff: one concrete toy run stepped through, then a table of scenarios as the abstraction, and then the prose rule. Each table row links to its trace. This covers abstracting over time and parameters, with no simulator.
- Robertson's small multiples result supports static abstraction over animation for analysis, which gives Victor's trajectory image an indirect empirical footing.
- Victor's stated purpose, letting readers check and rebut an argument, fits a reviewer's job better than the education framing. Aisch's trust case points the same way. Nobody has measured this.

### Gaps
- No empirical evaluation of ladder-of-abstraction designs was found. The search budget prevented a dedicated search.

## Synthesis: which interactions help, which are decorative, and a shortlist for code-change explanations

### Takeaway
The evidence favours few interactions, tied to a question the reader must answer or a change they must follow, with the whole argument available in text. A shortlist of six patterns follows. Only two have direct experimental support for a cognitive benefit, and neither was tested with developers.

### Cited Findings

Evidence for each row is cited in the sections above. The verdict column is a judgement.

| Interaction | Verdict | Basis |
|---|---|---|
| Predict or explain before reveal | **Helps** (strongest) | [Kim 2017](https://mucollective.northwestern.edu/files/2017-ExplainingTheGap-CHI.pdf), [Hundhausen 2002](https://faculty.cc.gatech.edu/~stasko/papers/jvlc02.pdf); [Banerjee 2015](https://rptel.apsce.net/index.php/RPTEL/article/download/2015-10015/190/583) is mixed on learning |
| Segmenting into discrete steps | **Helps** | [Rey 2019](https://www.doi.org/10.1007/S10648-018-9456-4), [Tversky 2002](https://hci.stanford.edu/courses/cs448b/papers/Tversky_AnimationFacilitate_IJHCS02.pdf) |
| Summary, claim headings, overview | **Helps** (non-interactive) | [Reder 1980](https://vufind.katalog.k.utb.cz/SummonRecord/FETCH-LOGICAL-c364t-607245daa49deb5b5bb1fbd587c3b7275455e754722aa8d9fcd0a00af26eeeb73/Details), [Hornbæk 2001](https://bibtex.github.io/CHI-2001-HornbaekF.html), [NN/g](https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/) |
| Text-figure linking | **Promising** (one study) | [Zhi 2019](https://profiles.wustl.edu/en/publications/linking-and-layout-exploring-the-integration-of-text-and-visualiz/) |
| Step through a state change | **Conditional:** only when the change is the content | [Ploetzner 2021](https://link.springer.com/article/10.1007/s11251-021-09541-w), [Hundhausen 2002](https://faculty.cc.gatech.edu/~stasko/papers/jvlc02.pdf) |
| Side-by-side before/after | **Conditional:** supported by analogy | [Robertson 2008](https://faculty.cc.gatech.edu/~stasko/papers/infovis08-anim.pdf), [Fyfe & Nathan 2019](https://scholarworks.iu.edu/iuswrrest/api/core/bitstreams/2c814639-f4c7-4091-a6eb-5e6e834bc546/content) |
| Reader-changed inputs | **Conditional, costly** | [Hundhausen 2002 on Lawrence](https://faculty.cc.gatech.edu/~stasko/papers/jvlc02.pdf), [Aisch 2017](https://vis4.net/blog/in-defense-of-interactive-graphics/) |
| Collapsible optional detail | **Neutral:** low cost, no measured benefit | [NN/g](https://www.nngroup.com/articles/accordions-on-desktop/) |
| Decorative or autoplay motion | **Decorative:** avoid | [Berney 2016](https://access.archive-ouverte.unige.ch/access/metadata/75bf6876-cb91-4e2c-8ac6-9d0767449449/download), [Robertson 2008](https://faculty.cc.gatech.edu/~stasko/papers/infovis08-anim.pdf), [seductive details](https://www.qic-wd.org/sites/default/files/Umbrella%20Summary%20-%20Seductive%20Details%20in%20Training%20041821.pdf) |
| Scroll-bound scrollytelling | **Not justified** | [McKenna 2017](https://users.cs.utah.edu/~miriah/publications/narrative-flow.pdf) |
| Tooltips or hover for needed content | **Harmful if essential** | [Tse 2016](https://raw.githubusercontent.com/archietse/malofiej-2016/master/tse-malofiej-2016-slides.pdf), [Aisch 2017](https://vis4.net/blog/in-defense-of-interactive-graphics/) |
| Free sliders or sandbox with no question | **Unsupported** | [Hundhausen 2002](https://faculty.cc.gatech.edu/~stasko/papers/jvlc02.pdf), [exploRNN](https://arxiv.org/pdf/2012.06326) |
| Tabs for core content | **Harmful** | [Tse 2016](https://raw.githubusercontent.com/archietse/malofiej-2016/master/tse-malofiej-2016-slides.pdf); find behaviour in [src/preload/findText.ts](../../src/preload/findText.ts) |
| Spaced repetition of a one-off diff | **Wrong genre** | [Matuschak note](https://notes.andymatuschak.org/zLgARWxc2xbGQP7LC3s1CSe) |

**Popular assumptions the evidence does not support:**
- Interactivity generally improves understanding. No such general result exists, and exploRNN and Kim et al. show text doing better on recall.
- Engagement or enjoyment indicates learning. Robertson, Banerjee and exploRNN all show them separating.
- Animation is the natural way to show a process. Most comparisons (59.3%) show no difference, and the mean effect is small.
- Giving readers control over pace unlocks animation's benefit. Berney's moderator analysis does not show this.
- Steppers or scrollers are better. Neither is established.
- Nobody clicks. The evidence is a couple of news graphics, and Tse's deck contains no figure.
- Better visual fidelity teaches better. Epistemic Fidelity had the poorest predictive record in Hundhausen.
- Concrete examples harm transfer. The original result is contested.
- Diagrams always help. UML effects run both ways.
- Prompts work for any prose. Matuschak's own notes dispute it.

### Inferences

**Recommended patterns.** All of these are inferences from the evidence above. The authoring shapes are proposals.

1. **Layered header: summary, claim headings, sticky contents.**
   - Purpose: serve the reader who stops early, and set up the 5-20 minute reading path.
   - Evidence: good but indirect ([Reder & Anderson](https://vufind.katalog.k.utb.cz/SummonRecord/FETCH-LOGICAL-c364t-607245daa49deb5b5bb1fbd587c3b7275455e754722aa8d9fcd0a00af26eeeb73/Details), [Hornbæk](https://bibtex.github.io/CHI-2001-HornbaekF.html), [NN/g](https://www.nngroup.com/articles/scrolling-and-attention/)). Missing: any study on technical documents or generated summaries.
   - Authoring: almost free. Contents derive from headings, and the agent writes the summary and claim headings.

2. **Trace stepper on a toy input.**
   - Purpose: follow state through a changed path when the change over time is the point. If the point is structure, use a static figure.
   - Evidence: segmenting and Tversky's discrete steps support the form. Missing: any test with developers, and any evidence that stepping alone beats a static table.
   - Design: an ordered list of all steps stays visible in HTML, and the figure highlights the current state. Nothing is hidden, no autoplay, under 8 or so steps. This satisfies Tse's rule and the find behaviour, and gives up the slideshow layout Zhi favoured for the sake of searchability.
   - Authoring: data only, as steps of `{label, state, note}`. Reliable if the agent derives states from actual execution or tests, risky if it imagines them.

3. **Before/after pair on the same input.**
   - Purpose: show what behaviourally changed, next to the claim.
   - Evidence: juxtaposition and small multiples beat animation for analysis in one trend study, and simultaneous comparison helps in education research. Missing: any direct test on behavioural diffs.
   - Authoring: two parallel values plus one explicit "difference" line. Static HTML.

4. **Predict-then-reveal check.**
   - Purpose: convert passive reading into a retrieval or prediction act and expose illusions of understanding.
   - Evidence: the best supported ([Kim 2017](https://mucollective.northwestern.edu/files/2017-ExplainingTheGap-CHI.pdf), [Hundhausen](https://faculty.cc.gatech.edu/~stasko/papers/jvlc02.pdf), Tversky's confound analysis). Evidence is missing for code reviewers, for self-graded reveals as opposed to committed answers, and for whether reviewers will tolerate it.
   - Design: `<details>` with the question in the summary, 2-4 per document, on behaviours the diff changes, always skippable, with no score. Kim's strongest effects came with explanation or feedback, so the answer should explain why.
   - Authoring: one question and one explanation. Quality is the main risk, as Matuschak warns.

5. **Text-diagram linking.**
   - Purpose: reduce the search between prose and figure.
   - Evidence: one crowdsourced study of one story. Missing: replication and technical content.
   - Authoring: shared ids, such as `data-ref="cache"` on the prose term and the node. Stable if the library handles it.
   - Search rule: pair the SVG with a text list of its elements, because library search drops SVG text.

6. **Optional depth through `<details>`.**
   - Purpose: answer "why this way?" and "what else did you consider?" without lengthening the path.
   - Evidence: expert guidance only. No measured comprehension benefit is known, so this is a cost-reduction pattern.
   - Design: one level, an informative summary line, an expand-all control, and a link to the relevant diff lines. No risks or caveats inside.
   - Authoring: trivial. The native element works with no script, and the viewer's find opens it.

**Conditional seventh, only if branching is the point: a scenario table.** A small set of precomputed inputs with outcomes, where each row opens its trace. Evidence: the Lawrence result, weakened because readers do not supply their own input, plus Victor's unevaluated argument. A live, editable model should stay out of scope because the generating agent cannot author one reliably in the time available.

**Selection rule for the agent.** Default to prose plus a static figure. Add a component only when it passes the test in the controlled-studies section. Budget roughly one stepper or comparison per main claim and no more than a few interactive elements per document. These numbers are judgement calls, not findings.

**Evaluate rather than assume.** Compare, on the same diffs, plain prose against prose with these components. Measure answers to questions about behaviour, confidence calibration and reading time, not preference or clicks, since this evidence base repeatedly shows those separating from understanding.

### Gaps
- Only predict-or-explain and segmenting have controlled support for a cognitive benefit, and both come from other populations. Everything else is extrapolation or guidance.
- Recommended counts (steps, questions, diagram elements under 20) have no direct empirical derivation in this setting, apart from Störrle's upper range.
- The trade-off between the slideshow advantage (one study) and full visibility is resolved here on product grounds, not evidence.
