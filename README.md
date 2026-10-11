# SENA KAVACH
### A Soldier Safety and Monitoring System

SENA KAVACH is a project focused on improving soldier safety in high-altitude areas, where extreme weather, difficult terrain and unreliable communication can make field operations challenging.

The idea is to bring soldier monitoring, location tracking and wireless communication together in one system. By combining sensors, LoRa communication, a monitoring dashboard and drone-assisted surveillance, SENA KAVACH aims to make important field information easier to access, even in areas with limited connectivity.

## What does it do?

- **Tracks location:** Uses GPS to help monitor the position of field units.
- **Monitors vital signs:** Uses sensors to measure parameters such as heart rate and blood oxygen levels.
- **Monitors the environment:** Collects readings such as altitude and gas levels to help identify potentially unsafe conditions.
- **Works without constant internet access:** Uses LoRa-based communication to exchange information over a local wireless link.
- **Provides a live dashboard:** Brings sensor readings, alerts and other system information together in one interface.
- **Supports drone-assisted observation:** Uses a drone to provide an aerial view of the surrounding area and explore ways to extend communication coverage.
- **Explores avalanche prediction:** Includes a software component for analysing data and developing avalanche-related prediction models.

## How it works

The system is built around three main components.

The soldier unit collects information from its sensors and transmits relevant data wirelessly. A local monitoring station receives the information and displays it on a dashboard, allowing an operator to view available readings and system status. A drone can provide an additional view of the surrounding terrain and, with further integration, act as a communication relay where radio coverage is limited.

The goal is to make these components work together while reducing dependence on external network infrastructure.

## Technology

SENA KAVACH brings together embedded systems, wireless communication, software and hardware design. Its technology includes ESP32-based controllers, LoRa modules, environmental and physiological sensors, GPS, Raspberry Pi hardware, a web-based dashboard and Python-based data analysis. The project also explores drone integration and custom-designed hardware enclosures.

## Current Development

SENA KAVACH is an ongoing project. Work focuses on developing its individual components, improving the monitoring interface, integrating hardware and software, and testing how the different modules can operate together.

The system's reliability, sensor accuracy, communication range and performance in extreme weather need to be validated through further testing before it can be considered suitable for real-world deployment.

## The Goal

The goal of SENA KAVACH is simple: use technology to help improve soldier monitoring, maintain communication in difficult environments and provide better access to information when it matters most.

*Designed with soldier safety in mind.*
