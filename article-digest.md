# Proof Point Digest -- Harsh Desai

This file captures reusable, evidence-backed proof points for evaluations, cover letters, and interview prep.

## Core Proof Points

### 1) Plasma test-rig control and repeatability
- Context: LVACCS testing rig characterization at SPRL (UM).
- What is being designed and validated: HV discharge-box power, protection, data-acquisition interface controls, protection interlocks, and remote power-supply control during hollow-cathode plasma-source turn-on.
- Why it matters: Improves test repeatability and safe operation during plasma-source turn-on.
- Relevance:
  - Fusion diagnostics: strong transfer (test controls, interlocks, repeatability).
  - Space instrumentation: strong transfer (measurement chain discipline).

### 2) Detector readout-chain modernization (FPGA + ADC)
- Context: FPGA design implementation for solid-state detector readout chain.
- What was built: Hard ADC IP optimization on FPGA fabric, Xilinx Zynq DMA/XADC digitization evaluation, MATLAB HDL Coder + AMD Vivado co-simulation workflow.
- Why it matters: Higher particle-energy resolution and better pile-up rejection workflow.
- Relevance:
  - Plasma diagnostics: direct transfer (detector + readout + acquisition quality).
  - Mass spectrometry instrumentation: adjacent transfer (detector signal-chain and digitization rigor).

### 3) Instrument calibration and ion-optics analysis bundle
- Context: SPACE 571 project series.
- What was built:
  - CEM calibration via PocketMCA/RC injection.
  - ESA transmission-function extraction from scan data.
  - SIMION dual-Einzel and Bessel-box analyses.
  - SRIM carbon-foil energy-loss / straggling workflow with TOF back-inference.
- Why it matters: Demonstrates full measurement lifecycle from physical setup to calibration model and uncertainty-aware interpretation.
- Relevance:
  - Fusion/space diagnostics: direct.
  - Mass spectrometry: strong adjacent via ion optics and detector behavior.

### 4) Systems-level mission instrumentation tradeoffs
- Context: Communications lead for Uranian Orbiter and Probe mission.
- What was done: Trade studies across payload constraints, telemetry allocation, and Ka-band/optical architecture.
- Why it matters: Shows systems-engineering judgment under mission constraints.
- Relevance:
  - Space instrumentation and payload engineering: direct.

### 5) Build-and-fly execution under competition constraints
- Context: SA Cup 2021.
- Outcome: Team ranked 23rd globally and 5th in Asia-Pacific out of 75 teams at the first attempt.
- Why it matters: Demonstrates end-to-end execution and technical delivery under schedule/performance constraints.

### 6) Payload mechanism design under CANSAT constraints
- Context: CANSAT 2022 tethered payload and CANSAT 2021 monowing payload.
- What was built:
  - CANSAT 2022: 10 m unidirectional tether-deployment mechanism using a DC motor and custom worm-gear spool; servo-actuated ejection/stabilization stack with dual-servo 2-axis gimbal.
  - CANSAT 2021: atmospheric re-entry vehicle simulation with two Maple Seed-inspired Monowing payloads for live telemetry and custom SRAD Ground Control Software.
- Outcome: CANSAT 2022 ranked 7th worldwide out of 42 teams; CANSAT 2021 ranked 13th globally and 7th in Asia-Pacific.
- Why it matters: Shows payload mechanism design, telemetry thinking, and competition-tested execution.

## Useful Links

- Portfolio: https://harshddes.github.io/
- SSD Readout Report: https://drive.google.com/file/d/1cb_1Vx5w__6OxFU2j2_Tn59uFXkM9p9M/view?usp=sharing
- Ion-Optics / Calibration Bundle: https://drive.google.com/drive/folders/1jq9MJzKta6NcMG_vUZo8V0y0Yu7kmSK6?usp=sharing
- UOP Mission Report: https://drive.google.com/file/d/1e4JlWVszDD1RgXqv2ruHCZQhk0sHbQ00/view?usp=sharing
- Sounding Rocket Report: https://drive.google.com/file/d/19GcuGf8MkgRR0t0MPE-XhEvW5EahuQBZ/view?usp=drive_link
- CANSAT 2022 Honor: https://drive.google.com/file/d/1wy3B8112TCHBuVJfQTUqal0ySfAxnZFM/view?usp=sharing

## Transition Positioning (Fusion + Mass Spec)

- Transition statement:
  - "I already execute diagnostics workflows where measurement quality is mission-critical. The domain changes, but the instrumentation discipline transfers."
- For fusion roles:
  - Highlight diagnostics setup, interlocks, calibration, uncertainty handling, and readout quality.
- For mass spectrometry roles:
  - Highlight ion-optics, detector response calibration, TOF logic, and signal-chain reliability.
