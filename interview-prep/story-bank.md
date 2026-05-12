# Story Bank — Master STAR+R Stories

This file accumulates your best interview stories over time. Each evaluation (Block F) adds new stories here. Instead of memorizing 100 answers, maintain 5-10 deep stories that you can bend to answer almost any behavioral question.

## How it works

1. Every time `/career-ops oferta` generates Block F (Interview Plan), new STAR+R stories get appended here
2. Before your next interview, review this file — your stories are already organized by theme
3. The "Big Three" questions can be answered with stories from this bank:
   - "Tell me about yourself" → combine 2-3 stories into a narrative
   - "Tell me about your most impactful project" → pick your highest-impact story
   - "Tell me about a conflict you resolved" → find a story with a Reflection

## Stories

<!-- Stories will be added here as you evaluate offers -->
<!-- Format:
### [Theme] Story Title
**Source:** Report #NNN — Company — Role
**S (Situation):** ...
**T (Task):** ...
**A (Action):** ...
**R (Result):** ...
**Reflection:** What I learned / what I'd do differently
**Best for questions about:** [list of question types this story answers]
-->

### Plasma Test Rig DAQ and HV Automation

**Source:** Report #011 -- Pranos Fusion -- Instrumentation Engineer
**S (Situation):** LVACCS needed repeatable hollow-cathode discharge testing with high-voltage sequencing, DAQ capture, and safe operator workflow.
**T (Task):** Build a control path that reduced manual steps while preserving calibration, protection interlocks, and synchronized logging.
**A (Action):** Configured Keithley DAQ plus TDK Lambda HV sequencing and built Python/PyVISA + Tkinter automation for remote plasma turn-on, interlocks, calibration, and logging.
**R (Result):** Reduced roughly 12-15 manual control/merge steps to about 3-5 GUI actions with 98.6% TDK-context coverage.
**Reflection:** The important lesson is that a good plasma test system is not just "make voltage happen"; it is controlled operation, traceable data, and fewer places for humans to create mystery bugs.
**Best for questions about:** DAQ automation, HV systems, test safety, lab execution, instrumentation ownership, translating experiments into usable controls

### Detector Readout Chain Upgrade Reasoning

**Source:** Report #011 -- Pranos Fusion -- Instrumentation Engineer
**S (Situation):** The SSD readout workflow needed a stronger acquisition path than the 1 MSPS XADC path for particle pulse measurements.
**T (Task):** Reason from detector charge, ADC requirements, sampling rate, and digital shaping toward a higher-rate readout architecture.
**A (Action):** Developed a Zynq-7000/Eclypse Z7 architecture concept using a 14-bit Zmod ADC 1410 at 125 MSPS, AXI-stream pulse acquisition, DMA-oriented data movement, and candidate FIR/trapezoidal shaping.
**R (Result):** Produced a clearer FPGA/ADC direction for higher-resolution detector pulse acquisition and validated the workflow through MATLAB/Simulink HDL Coder and Vivado co-simulation.
**Reflection:** The key move was not memorizing every FPGA feature like a tragic wizard; it was tracing the measurement problem backward from signal quality to sampling, data movement, and shaping.
**Best for questions about:** FPGA/ADC readout, digitizers, signal-chain design, technical tradeoffs, learning new hardware tools

### Calibration as Measurement Confidence

**Source:** Report #011 -- Pranos Fusion -- Instrumentation Engineer
**S (Situation):** Plasma and particle instruments need calibration evidence before their outputs deserve trust.
**T (Task):** Characterize detector/instrument response and convert raw measurement scans into operating choices.
**A (Action):** Performed CEM charge calibration using RC charge injection and CSA/shaper/MCA readout, plus ESA transmission-function extraction from energy-angle scan data.
**R (Result):** Built operating-bias and transmission-resolution evidence that connected raw measurements to instrument behavior.
**Reflection:** Calibration is the part where the instrument stops being a box of expensive opinions and starts becoming a measurement device.
**Best for questions about:** calibration, uncertainty, diagnostics, instrument commissioning, explaining technical rigor simply
