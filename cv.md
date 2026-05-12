# Harsh Desai

- Phone: +1 7345481080
- Email: harshdes@umich.edu
- Portfolio: [website: harshddes.github.io](https://harshddes.github.io/)
- LinkedIn: [LinkedIn: www.linkedin.com/in/harshddes/](https://www.linkedin.com/in/harshddes)

*Space Plasma Diagnostics Instrumentation, Testing + Measurement & readout chains; detector calibration, Ion Optics: SIMION/SRIM analysis, and systems engineering.*

## Education

### University of Michigan

**Location:** Ann Arbor, USA
**Degree:** Master of Engineering(M.Eng) - Space Systems Engineering, CGPA: 3.787/4.0
**Dates:** Aug'24 - Dec'25

- Systems Engineering + Space Plasma Research
- Coursework: Plasma & Fields Instrumentation, Plasma Measurement Techniques, Magnetosphere, Space Plasma Physics, Adv Fluid Mechanics, Space Weather Modeling, Control for Aerospace Vehicles, Space Systems Design and Mgmt., Spacecraft Technology

### Vellore Institute of Technology, Vellore

**Location:** Vellore, IND
**Degree:** B. tech - Mechanical Engineering
**Dates:** Jul'19 - Jul'23

- Worked Majorly on: Computational Engineering & Simulations - CFD, CAE

## Skills Summary

- **Languages:** Python, SCPI, MATLAB(learning), Verilog(Learning), VHDL(learning)
- **Tools:** FPGA Design Workflow, SIMION(Lua-learning), AMD Vivado, MATLAB HDL Coder & DSP Toolbox, NI VISA(PyVISA and PySerial), SPENVIS, SWMF & Global Magnetosphere-Ionosphere Models(MAGE, SWMF, HYPERS)
- **Data Tools:** Amptek DPPMCA, Keithley DAQs and SMUs, Google Data Studio, QGIS
- **Mech Tools:** ANSYS(GUI/TUI): Fluent, Mechanical; PyANSYS, OptiSlang, OpenFOAM, SolidWorks, Fusion 360, AutoCAD, Autodesk Inventor, MIDO, Xflr5, RocketPy, OpenRocket

## Work Experience

### Lunar Vehicle Active Charge Control System (LVACCS) Testing Rig Characterization

**Dates:** Feb'26--Present
**Advisor:** Dr. Omar Leon | Space Physics Research Lab (SPRL)
**Location:** UM-Ann Arbor

- Designing and validating HV discharge-box power, protection, and DAQ interface controls for a hollow-cathode keeper/discharge plasma-source test rig.
Characterizing remote hollow-cathode ignition and measurement workflow to improve test repeatability; automating HV discharge-box monitoring, protection interlocks, and remote power-supply control during plasma turn-on.
- Configured Keithley DAQ + TDK Lambda HV sequencing for hollow-cathode discharge testing: 1.3 A constant-current mode, 1300 V supply headroom, and Xenon ignition targets near 500 V / 50 SCCM / 22 PSIA.
- Built Python/PyVISA + Tkinter DAQ/HV automation for protection interlocks, calibration, remote plasma turn-on, and synchronized logging, reducing ~12-15 manual control/merge steps to ~3-5 GUI actions with 98.6% TDK-context coverage.

### Uranian Tropospheric Cloud Resolving Model

**Dates:** Sep'25--Dec'25
**Report:** [Link](https://drive.google.com/file/d/1C0pvkdFD_uKkH5fhPCAocLPmi3Fg70xb/view?usp=sharing) | **Advisor:** [Prof. Cheng Li](https://clasp.engin.umich.edu/people/li-cheng/)
**Location:** UM-Ann Arbor

- Researched methods to fine-tune a Snapy+Kintera chemical-kinetics Uranian troposphere cloud-resolving model using microwave radiometric synthetic validation techniques.
Investigated atmospheric modeling of Uranus, including microphysics implementation and parametric surveys; analyzed Voyager data to co-align and fine-tune the model.
- Ran Uranus cloud-resolving simulations on HPC, analyzing atmospheric microphysics, vertical velocity, plume structure, methane condensation, precipitation diagnostics, latent heating, and sedimentation.
- Designed parametric sensitivity sweeps for methane abundance/profile, microphysics, latent heating, and gravity to interpret convective intensity, cloud depth, and plume behavior.

### FPGA Design Implementation for Solid-State Detector (SSD) Readout Chain

**Dates:** Jan'25--Dec'25
**Report:** [Link](https://drive.google.com/file/d/1cb_1Vx5w__6OxFU2j2_Tn59uFXkM9p9M/view?usp=sharing) | **Pres:** [P1](https://drive.google.com/file/d/149WzLOPuB5uX1cVQB2b0kfdt1YkxJpFG/view?usp=sharing)/[P2](https://drive.google.com/file/d/1fP5PyrEaI2-hRiAlK8ebVCq7qUQ7X5Xv/view?usp=sharing) | **Advisor:** [Prof. Stefano Livi](https://clasp.engin.umich.edu/people/livi-stefano/) | SHRG
**Location:** UM-Ann Arbor

- Optimized hard ADC IPs on FPGA fabric for higher particle energy resolution on SSDs. Replaced analog processing chains using shaping amplifiers with higher sampling rates, finer acquisition control, filtering, and pile-up rejection.
- Developed a Zynq-7000/Eclypse Z7 SSD readout architecture for digital pulse acquisition, replacing the 1 MSPS XADC path with a 14-bit Zmod ADC 1410 concept at 125 MSPS.
- Derived ADC bit-depth and sampling-rate requirements from a 25 keV ion charge case, CSA/ENC limits, and quantization-noise constraints.
- Prototyped MATLAB/Simulink HDL Coder and Vivado co-simulation flows for AXI-stream pulse acquisition, DMA-oriented data movement, and candidate FIR/trapezoidal digital shaping.

### TestBedz: Small-Scale s/c Environmental Testing Facilitator Service

**Dates:** May'25--Jul'25
**Project:** [Link](https://msehgal001.github.io/TestBedz/) | **Advisor:** [Prof. Steven Battel](https://clasp.engin.umich.edu/people/battel-steven/)
**Location:** UM-Ann Arbor

- Implemented a spacecraft environmental-test feasibility and routing system for SPRL, integrating facility capability models, test-profile constraints, and requirements into automated, contract-ready test plans.
Developed a Client2Tester matching platform with requirement flowdown, lab-time allocation, and location-based filtering; aligned outputs to thermal-vacuum and vibration documentation practices.
- Built SPRL test-intake and routing platform using Vanilla JS/Tailwind, Node/Express, SQLite, and JWT/bcrypt with client, builder, and technician role gates.
- Structured 6 environmental-test profiles to capture requirement flowdown, standards tags, lab-time constraints, cycles, dwell time, target pressure, thermocouple coverage, and mounting needs.

### Rivera Event-Directional Discontinuity Correlational Study

**Dates:** May'25--Jul'25
**Advisor:** [Mojtaba Akhavan-Tafti](https://clasp.engin.umich.edu/people/akhavan-tafti-mojtaba/)
**Location:** UM-Ann Arbor

- Studied how Directional Discontinuities evolved in the Rivera conjunction to determine whether temporal matching and field-variable feature matching revealed correlation with solar-wind-stream heating. Developed the TS method to analyze Delta B change and evaluated TS multi-s/c correlation and MVA differences in results and categorization.

### Communications Lead - Uranian Orbiter and Probe mission

**Dates:** Sep'24--Apr'25
**Report:** [Link](https://drive.google.com/file/d/1e4JlWVszDD1RgXqv2ruHCZQhk0sHbQ00/view?usp=sharing) | SPACE 582/583 | L3Harris
**Location:** UM-Ann Arbor

- Led the Communications Subsystem of the Uranian Orbiter and Probe mission. Focused on Science Mission design and Traceability Scoping. Extrapolated the current Uranian known plasma environment to Science Instrumentation selection and design-for Fields & Particles instrument package optimization.
- Developed cost-effective alternatives to NASA's UOP Flagship Mission through trade studies across probe deployment, orbital optimization, telemetry allocation, and Ka-band/optical hybrid solutions for 4.5-year science operations.

## Projects

### Space Instrumentation Calibration & Ion-Optics Project Series

**Dates:** Sep'25--Dec'25
**Course:** SPACE 571 - Space Plasma Measuring Techniques

- **Channel Electron Multiplier (CEM) calibration** ([Experiment](https://drive.google.com/file/d/105pfynwuIVg_TPy9G_9gr1c2rj9VWnWe/view)): Charge-calibrated PocketMCA readout using an RC injector, measured CEM pulse-height distributions through a charge-sensitive amplifier (CSA), shaper, and multichannel analyzer (MCA), and used gain map G(V) to select operating bias.
- **Cylindrical Electrostatic Analyzer (ESA) calibration** ([Experiment](https://drive.google.com/file/d/1SHQp0bJXxDF_AkgcvPOfZhSBFcBxT_Jf/view?usp=sharing) | [SIMION analysis](https://drive.google.com/file/d/1OWtlDylwIrSL-LJxO4SMOg75hnlVdVcA/view?usp=sharing)): Built transmission function T(E,alpha) from energy-angle scan data and extracted moments to quantify resolution and angular acceptance.
- **SIMION dual-Einzel beam expander** ([Report](https://drive.google.com/file/d/1NmYVhtXiXAdp2Q7RKIF5JIQZQjyVh4KB/view?usp=sharing)): Performed an afocal lens-voltage sweep for exit collimation, then evaluated expansion ratio and beam quality using RMS radii and figure of merit (FoM).
- **SIMION Bessel-box energy filter** ([Report](https://drive.google.com/file/d/1yfdiA41DbK1-98C4qJLHxBM9xEWfD3NQ/view?usp=sharing)): Estimated transmission function to fit a Gaussian obtaining central mean energy and full width at half maximum (FWHM) with propagated uncertainty.
- **Stopping and Range of Ions in Matter (SRIM) carbon-foil Delta E study** ([Report](https://drive.google.com/file/d/1m4qjyr0cgxBp8j9nEP0LaVEn09NEFOYl/view?usp=sharing)): Used SRIM TRANSMIT to model energy loss and straggling for carbon foils, then inferred thickness by matching time-of-flight (TOF)-derived exit energies.

### Spatial Ion-Electron Temperature Correlation Analysis Using Hybrid CCMC Models

**Dates:** Feb'25--Apr'25
**Report:** [Link](https://drive.google.com/file/d/1x6fm2dZtLi4hjcGfQf2WpbNDZLsGMDGT/view?usp=sharing)

- Multi-fluid simulation: Utilizing SWMFv23 with MAGE on CCMC, figuring out limitations in resolving independent ion and electron energy equations within a global multi-fluid MHD framework--to backtrace Ion- spatial distributions across bow shock and magnetosheath domains.
- Had to further investigate using HYPERS- hybrid model on CCMC. Downstream reconnection-driven E_parallel J_parallel heating reveals peak electron temperature excursions preceding ion maxima, with Delta T_i - T_e oscillations dominated by convective transport, evidencing cross-species energy partitioning during shock events

### CANSAT 2021(Organized by NASA & AAS)

**Dates:** Aug'20--Jul'21
**Critical Design Review:** [Link](https://drive.google.com/file/d/1xcsrNZNLANhM8cnS2_iKqS9KlfMemFc_/view?usp=sharing)

- Simulated an atmospheric re-entry vehicle in the CANSAT mission with two Maple Seed-inspired Monowing payloads for live telemetry; developed custom SRAD Ground Control Software.Created and optimized a Mono-wing design using transient simulation for flow analysis, employing a MATLAB script for maximum torque and efficiency.

### CANSAT 2022 (Tethered Payload) (Organized by NASA & AAS)

**Dates:** Aug'21--Jul'22
**Critical Design Review:** [Link](https://drive.google.com/file/d/1M-WQG0x1WI9SherThK6GIEdIPda9CDkr/view?usp=sharing)

- Engineered a 10 m unidirectional tether-deployment mechanism using a DC motor and custom worm-gear spool, enabling non-backdrivable load transfer and controlled descent of a 2 mm braided-nylon payload line.
- Built a servo-actuated ejection and stabilization stack: elastic-lid release with torsion-spring lock for parachute deployment, plus a dual-servo 2-axis gimbal maintaining a fixed 45 degrees downward south-facing camera vector.

## Honors

- **Special Achievers Award recipient 20219-22** ([Link](https://drive.google.com/file/d/1WLOBH4m6eUPxqF8WWfclOOagim9JJ596/view?usp=sharing)): Recognized as a Special Achiever by VIT for outstanding international representation and performance.
- **SA Cup 2021 (organized by ESRA)** ([Link](https://drive.google.com/file/d/1F4eyTNrddvHkXNUDX06rpD7Nm-byS2GG/view?usp=sharing)): The team secured 23rd rank globally, being 5th in Asia-Pacific(out of 75 teams) at our very first attempt.
- **CANSAT 2022 (Tethered Payload)-Organized by NASA & AAS** ([Link](https://drive.google.com/file/d/1wy3B8112TCHBuVJfQTUqal0ySfAxnZFM/view?usp=sharing)): secured a personal best worldwide rank of 7th(out of 42 teams).
- **CANSAT 2021 (Organized by NASA & AAS)** ([Link](https://drive.google.com/file/d/1xcsrNZNLANhM8cnS2_iKqS9KlfMemFc_/view?usp=sharing)): Team Sammard secured a brilliant position of 13th globally and 7th in Asia-Pacific.
