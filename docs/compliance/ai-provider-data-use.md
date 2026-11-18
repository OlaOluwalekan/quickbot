# AI Provider Data Use & Privacy Compliance

**Document Version:** 1.0  
**Effective Date:** November 8, 2026  
**Reference:** Product Architecture Specification §2.8, Appendix C #3

---

## 1. Executive Summary

Klecx is an independent collaborative workspace client that connects to enterprise generative AI model endpoints. This document records the architectural guarantees, technical controls, and commercial vendor terms governing prompt processing and zero model training on customer data.

## 2. Model Training Exemption

All inferences performed through Klecx utilize commercial API tiers governed by business and enterprise terms that explicitly prohibit the use of customer inputs and outputs for model training or improvement.

### Guarantees
1. **Zero Public Training**: Customer prompts, uploaded documents, conversation history, and model responses are never used to train, retrain, or fine-tune public foundation models.
2. **Statutory Processing Only**: Prompts sent to model providers are processed transiently for the sole purpose of generating the requested answer and returning streaming tokens.
3. **No Secondary Data Sharing**: Model providers do not sell, rent, or distribute customer prompt text or attachments to third parties.

## 3. Data Processing Architecture

- **In-Transit Encryption**: All communication between the user's browser, Klecx servers, and third-party model inference endpoints occurs over encrypted TLS 1.3 channels.
- **Tenant Isolation**: Workspaces, responses, annotations, and uploaded attachments are strictly scoped to the workspace owner and invited collaborators under role-based access control.
- **Data Minimization**: Prompts are transmitted to model inference endpoints containing only the context required for the turn (including prior messages and relevant workspace attachments requested by the user).

## 4. Sub-Processor Registry

In accordance with statutory privacy obligations (GDPR / NDPA), third-party infrastructure and model providers are disclosed under the statutory sub-processor registry. All providers operate under binding Data Processing Agreements (DPAs).

---

*Confirmed and verified for Klecx Compliance on 2026-11-08.*
