# Harsh Desai

- Phone: +1-734-548-1080
- Email: harshdes@umich.edu
- Portfolio: [website: harshddes.github.io](https://harshddes.github.io/)
- LinkedIn: [LinkedIn: www.linkedin.com/in/harshddes/](https://www.linkedin.com/in/harshddes)

*Space plasma diagnostics instrumentation, testing and measurement readout chains, detector calibration, ion optics, SIMION/SRIM analysis, and systems engineering.*

## Education

### University of Michigan

**Location:** Ann Arbor, USA
**Degree:** Master of Engineering (M.Eng) - Space Systems Engineering, GPA: 3.79/4.0
**Dates:** Aug'24 - Dec'25

- Systems Engineering + Space Plasma Research
- Coursework: Plasma & Fields Instrumentation, Plasma Measurement Techniques, Magnetosphere, Space Plasma Physics, Adv Fluid Mechanics, Space Weather Modeling, Control for Aerospace Vehicles, Space Systems Design and Mgmt., Spacecraft Technology

### Vellore Institute of Technology, Vellore

**Location:** Vellore, IND
**Degree:** Bachelor of Technology (B.Tech) - Mechanical Engineering, GPA: 7.78/10
**Dates:** Jul'19 - Jul'23

- Worked Majorly on: Computational Engineering & Simulations - CFD, CAE

## Skills Summary

- **Languages:** Python, SCPI, MATLAB (learning), Verilog (learning), VHDL (learning)
- **Tools:** FPGA design workflow, SIMION, Amptek DPPMCA, AMD Vivado, MATLAB HDL Coder and DSP Toolbox, NI VISA (PyVISA and PySerial), SPENVIS, Space Weather Modeling Framework (SWMF), Multiscale Atmosphere-Geospace Environment (MAGE), HYPERS, Google Data Studio, QGIS
- **Hardware:** Vacuum chamber operation (CTI-Cryogenics Hi-Vac and roughing pump, operated at 1 milliTorr), Keithley DAQs and SMUs, TDK Lambda power supplies, high-voltage switching operations
- **Mechanical Tools:** ANSYS (GUI/TUI): Fluent, Mechanical; PyANSYS, OptiSlang, OpenFOAM, SolidWorks, Fusion 360, AutoCAD, Autodesk Inventor, SpaceClaim, MIDO, Xflr5, RocketPy, OpenRocket
- **Spoken Languages:** English, Hindi, Gujarati (native, trilingual)

## Work Experience

### Lunar Vehicle Active Charge Control System (LVACCS) Testing Rig Characterization

**Dates:** Feb'26--Present
**Advisor:** Dr. Omar Leon | Space Physics Research Lab (SPRL)
**Location:** UM-Ann Arbor

- Validated high-voltage power interface controls through failure-mode analysis of a 1300 V discharge box to protect hardware during high-throughput plasma-source characterization.
- Developed a Python/PyVISA + Tkinter graphical interface that reduced manual test interactions from 15 steps to 5 while automating plasma ignition sequences, mass-flow control, and remote power-supply coordination.
- Characterized remote hollow-cathode ignition workflows for repeatable plasma turn-on, reaching 98.6% synchronized logging coverage across data streams and saving 15 minutes of post-run processing.
- Configured Keithley DAQ and TDK Lambda high-voltage sequencing for hollow-cathode discharge testing: 1.3 A constant-current mode, 1300 V supply headroom, and xenon ignition targets near 500 V / 50 SCCM / 22 PSIA.

### Uranian Tropospheric Cloud Resolving Model

**Dates:** Sep'25--Dec'25
**Report:** [Link](https://drive.google.com/file/d/1C0pvkdFD_uKkH5fhPCAocLPmi3Fg70xb/view?usp=sharing) | **Advisor:** [Prof. Cheng Li](https://clasp.engin.umich.edu/people/li-cheng/)
**Location:** UM-Ann Arbor

- Ran Uranus cloud-resolving simulations on a High-Performance Computing (HPC) cluster to study methane abundance/profile sensitivity, latent heating, microphysics settings, and gravity.
- Investigated latent-heating and sedimentation coupling by analyzing vertical velocity, methane condensation diagnostics, plume structure, precipitation behavior, and atmospheric microphysics.
- Researched methods to fine-tune a Snapy+Kintera chemical-kinetics Uranian troposphere cloud-resolving model using microwave radiometric synthetic validation techniques.
- Designed parametric sensitivity sweeps for methane abundance/profile, microphysics, latent heating, and gravity to interpret convective intensity, cloud depth, and plume behavior.

### FPGA Design Implementation for Solid-State Detector (SSD) Readout Chain

**Dates:** Jan'25--Dec'25
**Report:** [Link](https://drive.google.com/file/d/1cb_1Vx5w__6OxFU2j2_Tn59uFXkM9p9M/view?usp=sharing) | **Pres:** [P1](https://drive.google.com/file/d/149WzLOPuB5uX1cVQB2b0kfdt1YkxJpFG/view?usp=sharing)/[P2](https://drive.google.com/file/d/1fP5PyrEaI2-hRiAlK8ebVCq7qUQ7X5Xv/view?usp=sharing) | **Advisor:** [Prof. Stefano Livi](https://clasp.engin.umich.edu/people/livi-stefano/) | SHRG
**Location:** UM-Ann Arbor

- Developed a digital readout roadmap for solid-state detectors by sizing ADC, sampling-rate, and digital-shaping requirements against scientific particle-detection targets.
- Simulated an increase in pulse digitization rate from 1 MSPS to 125 MSPS by integrating a 14-bit Zmod ADC 1410 path into a Zynq-7000/Eclypse Z7 programmable-logic architecture.
- Achieved functional correlation between MATLAB golden models and Vivado co-simulations for high-speed digital signal-processing paths using MATLAB HDL Coder.
- Evaluated 125 MHz system-clock timing limits through post-synthesis Register-Transfer Level (RTL) analysis, identifying Worst Negative Slack path constraints in the Zynq system-on-chip architecture.
- Derived ADC bit-depth and sampling-rate requirements from a 25 keV ion charge case, charge-sensitive amplifier (CSA) / equivalent noise charge (ENC) limits, and quantization-noise constraints.

### TestBedz: Small-Scale s/c Environmental Testing Facilitator Service

**Dates:** May'25--Jul'25
**Project:** [Link](https://msehgal001.github.io/TestBedz/) | **Advisor:** [Prof. Steven Battel](https://clasp.engin.umich.edu/people/battel-steven/)
**Location:** UM-Ann Arbor

- Developed "TestBedz", a full-stack platform for spacecraft qualification testing that collapses multi-round requirement negotiations into structured submissions for thermal-vacuum, vibration, and electromagnetic interference (EMI) testing cycles.
- Implemented a spacecraft environmental-test feasibility and routing system for SPRL, integrating facility capability models, test-profile constraints, and requirements into automated, contract-ready test plans.
- Built SPRL test-intake and routing platform using Vanilla JS/Tailwind, Node/Express, SQLite, and JWT/bcrypt with client, builder, and technician role gates.
- Facilitated requirement flowdown through role-based matching between hardware profiles and facility operational limits across 6 environmental-test profiles.

### Rivera Event-Directional Discontinuity Correlational Study

**Dates:** May'25--Jul'25
**Advisor:** [Mojtaba Akhavan-Tafti](https://clasp.engin.umich.edu/people/akhavan-tafti-mojtaba/)
**Location:** UM-Ann Arbor

- Synchronized temporal alignments across three data cadences (1 s, 10 s, 60 s) to identify solar-wind event matches by shifting Parker Solar Probe timestamps against Solar Orbiter observations using Python and pyspedas.
- Quantified magnetic-field mismatch metrics and solar-wind stream evolution by implementing Tsurutani-Smith jump detection across cadences and 180-second lag windows.
- Studied how directional discontinuities evolved in the Rivera conjunction to test whether temporal matching and field-variable feature matching correlated with solar-wind-stream heating.

### Communications Lead - Uranian Orbiter and Probe mission

**Dates:** Sep'24--Apr'25
**Report:** [Link](https://drive.google.com/file/d/1e4JlWVszDD1RgXqv2ruHCZQhk0sHbQ00/view?usp=sharing) | SPACE 582/583 | L3Harris
**Location:** UM-Ann Arbor

- Led communications subsystem design for the Uranian Orbiter and Probe mission study, managing 15 Deep Space Network (DSN) connectivity and fault-tolerance requirements through a requirements traceability matrix.
- Achieved a projected 16% ($450M) preliminary mission-cost reduction by evaluating an orbiter-only architecture with a heritage five-instrument suite and capped payload budget.
- Developed cost-effective alternatives to NASA's UOP Flagship Mission through trade studies across probe deployment, orbital optimization, telemetry allocation, and Ka-band/optical hybrid solutions for 4.5-year science operations.

### PentaShield Technologies Pvt. Ltd.

**Dates:** Jun'24--Aug'24
**Role:** Project Intern
**Location:** Vadodara, India

- Engineered a program for multi-objective optimization of ballistic missile airframe designs, integrating a backend computational fluid dynamics (CFD) solver, surrogate modeling, and MODO workflows using IGES geometry as input.
- Automated a parametric design workflow using PyFluent and PyOptiSLang to improve geometry pre-processing, design validation, and optimization inside ANSYS simulation workflows.

### Predictive Insurance Modeling for Agri-Insurance Sector

**Dates:** Nov'23--Dec'23
**Role:** Research Assistant
**Organization:** Christ University, Pune
**Location:** Remote, India

- Deployed a TensorFlow weather-prediction model on a Google Cloud virtual machine using time-series data from the ISRO Bhuvan database to support agricultural insurance-rate analysis.
- Analyzed geospatial vegetation-index, crop, and soil data to connect real-time climate signals with insurance-risk assessment and premium-adjustment logic.

## Projects

### Space Instrumentation Calibration & Ion-Optics Project Series

**Dates:** Sep'25--Dec'25
**Course:** SPACE 571 - Space Plasma Measuring Techniques

- **Channel Electron Multiplier (CEM) calibration** ([Experiment](https://drive.google.com/file/d/105pfynwuIVg_TPy9G_9gr1c2rj9VWnWe/view)): Optimized operating bias by mapping pulse-height distributions and amplifier gain using a charge-calibrated PocketMCA readout, RC injector, charge-sensitive amplifier (CSA), shaper, and multichannel analyzer (MCA).
- **Cylindrical Electrostatic Analyzer (ESA) calibration** ([Experiment](https://drive.google.com/file/d/1SHQp0bJXxDF_AkgcvPOfZhSBFcBxT_Jf/view?usp=sharing) | [SIMION analysis](https://drive.google.com/file/d/1OWtlDylwIrSL-LJxO4SMOg75hnlVdVcA/view?usp=sharing)): Generated transmission functions from energy-angle scan data and extracted moments to quantify energy resolution and angular acceptance.
- **SIMION dual-Einzel beam expander** ([Report](https://drive.google.com/file/d/1NmYVhtXiXAdp2Q7RKIF5JIQZQjyVh4KB/view?usp=sharing)): Performed an afocal lens-voltage sweep for exit collimation, then evaluated expansion ratio and beam quality using RMS radii and figure of merit (FoM).
- **SIMION Bessel-box energy filter** ([Report](https://drive.google.com/file/d/1yfdiA41DbK1-98C4qJLHxBM9xEWfD3NQ/view?usp=sharing)): Modeled ion-optical filter response by estimating transmission functions, fitting Gaussian profiles, and calculating full width at half maximum (FWHM) with propagated uncertainty.
- **Stopping and Range of Ions in Matter (SRIM) carbon-foil Delta E study** ([Report](https://drive.google.com/file/d/1m4qjyr0cgxBp8j9nEP0LaVEn09NEFOYl/view?usp=sharing)): Used SRIM TRANSMIT to model energy loss and straggling for carbon foils, then inferred thickness by matching time-of-flight (TOF)-derived exit energies.

### Spatial Ion-Electron Temperature Correlation Analysis Using Hybrid CCMC Models

**Dates:** Feb'25--Apr'25
**Report:** [Link](https://drive.google.com/file/d/1x6fm2dZtLi4hjcGfQf2WpbNDZLsGMDGT/view?usp=sharing)

- Evaluated ion-electron temperature separation inside Space Weather Modeling Framework (SWMF) and Multiscale Atmosphere-Geospace Environment (MAGE) global multi-fluid magnetohydrodynamics (MHD) simulations by tracing ion distributions across bow shock and magnetosheath domains.
- Characterized reconnection-driven heating by identifying peak electron-temperature excursions during simulated shock events using the HYPERS hybrid model to evaluate convective-transport dominance.

### CANSAT 2021(Organized by NASA & AAS)

**Dates:** Aug'20--Jul'21
**Critical Design Review:** [Link](https://drive.google.com/file/d/1xcsrNZNLANhM8cnS2_iKqS9KlfMemFc_/view?usp=sharing)

- Engineered a real-time telemetry acquisition framework for an atmospheric re-entry vehicle by building custom student-researched and developed (SRAD) ground control software to monitor dual maple-seed-inspired payload deployments using MATLAB.
- Simulated and optimized a mono-wing payload using transient flow analysis and MATLAB torque/efficiency calculations.

### CANSAT 2022 (Tethered Payload) (Organized by NASA & AAS)

**Dates:** Aug'21--Jul'22
**Critical Design Review:** [Link](https://drive.google.com/file/d/1M-WQG0x1WI9SherThK6GIEdIPda9CDkr/view?usp=sharing)

- Engineered a 10 m unidirectional tether-deployment mechanism using a DC motor and custom worm-gear spool, enabling non-backdrivable load transfer and controlled descent of a 2 mm braided-nylon payload line.
- Built a servo-actuated ejection and stabilization stack: elastic-lid release with torsion-spring lock for parachute deployment, plus a dual-servo 2-axis gimbal maintaining a fixed 45 degrees downward south-facing camera vector.

## Honors

- **Special Achievers Award, Vellore Institute of Technology (2019-22)** ([Link](https://drive.google.com/file/d/1WLOBH4m6eUPxqF8WWfclOOagim9JJ596/view?usp=sharing)): Recognized for international competition representation and technical performance.
- **Spaceport America Cup / Intercollegiate Rocket Engineering Competition (IREC) 2021** ([Link](https://drive.google.com/file/d/1F4eyTNrddvHkXNUDX06rpD7Nm-byS2GG/view?usp=sharing)): Placed 23rd globally and 5th in Asia-Pacific by launching a Mach 0.9 solid-motor sounding rocket to a 10,000-foot target altitude.
- **CANSAT 2022 (Tethered Payload), NASA & AAS** ([Link](https://drive.google.com/file/d/1wy3B8112TCHBuVJfQTUqal0ySfAxnZFM/view?usp=sharing)): Engineered a 10 m tether-deployment mechanism and dual-servo camera-stabilization stack; ranked 7th worldwide out of 42 teams.
- **CANSAT 2021, NASA & AAS** ([Link](https://drive.google.com/file/d/1xcsrNZNLANhM8cnS2_iKqS9KlfMemFc_/view?usp=sharing)): Built real-time telemetry and ground-control software for dual maple-seed-inspired payload deployment; team ranked 13th globally and 7th in Asia-Pacific.
