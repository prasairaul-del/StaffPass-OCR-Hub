# StaffPass Local OCR Hub

## Production Build Blueprint & Technical Roadmap

Version: 1.0
Status: Historical blueprint; current release-readiness baseline is Electron `40.9.3` with local-first runtime processing, real PDF preview, CSV export, DB validation/migrations, and cert-gated production release scripts.

---

# Executive Summary

StaffPass Local OCR Hub is a local-first desktop application designed to automate the ingestion, extraction, validation, archiving, and indexing of staff identification documents including:

* Passports
* Emirates IDs
* Residence Visas
* Labor Cards
* Other accreditation documents

The application is intended for Windows 10 and Windows 11 environments. Runtime document processing stays local with no cloud OCR, telemetry, analytics, or background daemon dependency. Optional model downloads and GitHub update checks may use the network when enabled by the operator.

Primary goals:

* Local-First Runtime Operation
* Low Resource Consumption
* Privacy-First Design
* Future-Proof OCR Engine
* Enterprise-Grade Document Tracking
* Fast Batch Processing

---

# Core Product Vision

The application should become a local document processing hub capable of:

1. Accepting document images and PDFs.
2. Automatically extracting metadata.
3. Validating extracted information.
4. Detecting duplicate staff records.
5. Archiving files using standardized naming conventions.
6. Building a searchable local accreditation database.
7. Providing a review workflow for uncertain extractions.
8. Operating efficiently on lower-end hardware.

---

# Design Principles

## Privacy First

No external OCR API calls.

No cloud OCR.

No telemetry.

No analytics collection.

No remote inference.

No Docker dependencies.

No Ollama service requirements.

Document processing remains local. Release update checks and model-download setup are treated as explicit online operations, not runtime OCR dependencies.

---

## Memory Efficient

The OCR model should:

* Load only when required.
* Process requested documents.
* Save extracted results.
* Fully unload from memory.

When idle:

* VRAM usage should be zero.
* RAM usage should be minimal.
* CUDA cache should be cleared.

---

## Future-Proof AI Architecture

OCR implementation must be fully decoupled from application logic.

A new model should be replaceable without:

* UI changes
* Database changes
* File system changes
* Business logic changes

---

# Long-Term System Architecture

```text
┌────────────────────────────────────────────┐
│                 USER INTERFACE             │
└────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────┐
│             DOCUMENT INGESTION             │
│   Images / PDFs / Batch Uploads            │
└────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────┐
│          PREPROCESSING ENGINE              │
│ Rotation Detection                         │
│ Skew Correction                            │
│ Denoising                                  │
│ Contrast Enhancement                       │
│ Resolution Normalization                   │
└────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────┐
│             OCR ADAPTER LAYER              │
│      BaseVLMAdapter Interface              │
└────────────────────────────────────────────┘
                    │
     ┌──────────────┼──────────────┐
     ▼              ▼              ▼
 GLMOCR      Future OCR #1   Future OCR #2

                    │
                    ▼
┌────────────────────────────────────────────┐
│           EXTRACTION VALIDATOR             │
│ JSON Validation                            │
│ Field Verification                         │
│ Confidence Scoring                         │
│ Data Cleanup                               │
└────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────┐
│          STAFF MATCHING ENGINE             │
│ Duplicate Detection                        │
│ Existing Staff Resolution                  │
└────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────┐
│             DATABASE LAYER                 │
│ SQLite                                     │
└────────────────────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────┐
│            ARCHIVE MANAGEMENT              │
│ Rename                                     │
│ Move                                       │
│ Organize                                   │
└────────────────────────────────────────────┘
```

---

# Major Architectural Improvements

## 1. Background OCR Processing

### Current Problem

The current implementation runs OCR directly inside the UI thread.

Result:

* Frozen interface
* Unresponsive windows
* Poor user experience

### Required Solution

Implement:

```text
UI Thread
    │
    ▼
Background Worker Thread
    │
    ▼
OCR Processing
```

Benefits:

* Responsive interface
* Progress updates
* Cancel functionality
* Better scalability

---

## 2. Intelligent Image Preprocessing

### Current Problem

Raw images are sent directly to the OCR model.

Poor-quality images reduce accuracy.

### Required Processing Pipeline

#### Auto Rotation

Detect:

* 90°
* 180°
* 270°

rotation errors.

---

#### Deskewing

Correct:

* Camera angle distortion
* Crooked scans

---

#### Denoising

Remove:

* Compression artifacts
* Camera noise
* Blurred backgrounds

---

#### Contrast Enhancement

Improve:

* Faded scans
* Low-light captures

---

#### Resolution Normalization

Ensure:

* Consistent OCR input quality

---

# PDF Support

Current version only supports:

* JPG
* JPEG
* PNG

Future system must support:

* Single-page PDFs
* Multi-page PDFs

Processing flow:

```text
PDF
 │
 ▼
Convert Pages To Images
 │
 ▼
Preprocess
 │
 ▼
OCR
```

---

# Robust OCR Validation Layer

## Problem

LLMs occasionally generate malformed JSON.

Current implementation trusts output too heavily.

---

## Required Validation Pipeline

```text
Raw OCR Output
      │
      ▼
JSON Parser
      │
      ▼
Schema Validator
      │
      ▼
Data Normalizer
      │
      ▼
Confidence Evaluation
```

---

## Required Validation Checks

### First Name

Must:

* Exist
* Not be empty

---

### Last Name

Must:

* Exist
* Not be empty

---

### Document Number

Must:

* Exist
* Match expected patterns

---

### Expiry Date

Must:

* Parse correctly
* Convert to ISO format

Example:

```text
YYYY-MM-DD
```

---

### Phone Number

Optional.

Normalize into:

```text
+971XXXXXXXXX
```

where possible.

---

# Confidence Scoring System

Each extraction should receive a confidence score.

Example:

```json
{
  "confidence": 94
}
```

Confidence categories:

| Score    | Status                 |
| -------- | ---------------------- |
| 95-100   | Trusted                |
| 80-94    | Review Recommended     |
| Below 80 | Manual Review Required |

---

# Manual Review Workflow

Instead of simply failing:

Documents enter a review queue.

Statuses:

```text
Pending Review
Approved
Rejected
Corrected
```

Review operators can:

* Edit extracted values
* Save corrections
* Approve records

---

# Staff Deduplication Engine

## Current Problem

Every upload creates a new staff record.

Duplicates will accumulate rapidly.

---

## Required Matching Logic

Priority order:

1. Passport Number
2. Emirates ID Number
3. Visa Number
4. Phone Number
5. Name Similarity

---

## Outcomes

### Existing Staff Found

Attach document to existing profile.

### New Staff

Create new staff profile.

---

# Enhanced Database Architecture

## Staff Table

```text
staff
```

Fields:

* id
* first_name
* last_name
* phone_number
* overall_status
* created_at
* updated_at

---

## Documents Table

```text
documents
```

Fields:

* id
* staff_id
* doc_type
* doc_number
* expiry_date
* confidence_score
* file_path
* review_status
* uploaded_at

---

## Audit Log Table

```text
audit_logs
```

Tracks:

* Uploads
* OCR events
* Corrections
* Approvals
* Deletions

---

# File Naming Safety

## Current Risk

Names may contain:

```text
/
\
:
*
?
"
<
>
|
```

which break Windows paths.

---

## Required Sanitization

Before saving:

* Remove illegal characters
* Collapse repeated underscores
* Trim spaces

Example:

```text
SMITH_JOHN_PASSPORT_A1234567.jpg
```

---

# Archive Strategy

Support three modes.

## Mode 1

Copy Original

```text
Input -> Archive
```

---

## Mode 2

Move Original

```text
Input -> Archive
```

Original removed.

---

## Mode 3

Quarantine

Failed documents moved into:

```text
/quarantine/
```

for manual inspection.

---

# Batch Processing System

Support:

```text
Single File
Multiple Files
Entire Folder
```

Workflow:

```text
Folder
 │
 ▼
Queue
 │
 ▼
Worker Pool
 │
 ▼
Archive
```

---

# OCR Adapter Standard

Every OCR implementation must follow:

```python
class BaseVLMAdapter:
```

Required methods:

```python
load()
extract_metadata()
unload()
```

Recommended future methods:

```python
health_check()
supports_pdf()
get_version()
get_model_name()
estimate_confidence()
```

---

# Security Requirements

No internet access.

No external OCR APIs.

No telemetry.

No automatic updates.

No cloud synchronization.

No hidden services.

No background daemons.

All files remain local.

---

# Performance Targets

Target Hardware:

* Intel i5 8th Gen+
* 8GB RAM
* Windows 10/11

Expected:

* Startup under 3 seconds
* OCR under 10 seconds per document
* Idle RAM below 250MB
* Zero VRAM usage when idle

---

# Recommended Development Roadmap

Phase 1

* Core UI
* SQLite
* OCR Integration
* File Archiving

Phase 2

* Image Preprocessing
* PDF Support
* Batch Processing

Phase 3

* Validation Engine
* Confidence Scoring
* Review Workflow

Phase 4

* Staff Deduplication
* Audit Logging
* Advanced Search

Phase 5

* Performance Optimization
* Packaging
* Enterprise Deployment

---

# Final Objective

Build a secure, enterprise-ready, fully offline accreditation management platform that can reliably process staff documents, maintain a clean searchable database, intelligently detect duplicates, support future OCR models, and operate efficiently on modest Windows hardware while maintaining complete privacy and data ownership.
