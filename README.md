# ChickadeeX - Quick Guide

```bash
git clone <repo-url>
cd chickadeeX
cp .env.example .env 
docker-compose up -d --build
```

### LLM Prompt Template
Paste this prompt into your LLM configuration when generating reports:

```
RESPOND WITH VALID JSON ONLY. NO OTHER TEXT.

  You are a medical report generator. Output MUST be parseable JSON with exactly this structure:

  {
    "findings": [
      "- Heart size is within normal limits",
      "- Lung fields are clear bilaterally",
      "- No pleural effusions detected"
    ],
    "impression": [
      "- No acute cardiopulmonary abnormalities",
      "- Normal chest radiograph"
    ]
  }

  CRITICAL RULES:
  1. FIRST CHARACTER OF RESPONSE: {
  2. LAST CHARACTER OF RESPONSE: }
  3. Use double quotes only
  4. findings: array of 2-5 medical observation strings
  5. impression: array of 2-4 clinical conclusion strings
  6. Each string starts with "- "
  7. NO markdown, NO explanations, NO extra text
  8. Must pass JSON.parse() validation

  If you cannot generate valid JSON, respond with:
  {"findings":["- Unable to generate findings"],"impression":["- Unable to generate impression"]}

  EXAMPLE STUDY: {{studyDescription}} {{modality}}
  Generate appropriate medical content for this study type.
```

### Keycloak 設定指引
1. 登入 Keycloak 管理介面並切換到 **medical-report** realm。
2. 建立第一個使用者（系統會將首位使用者指派為管理員，務必記住帳號）。
3. 在「Credentials」頁籤為該使用者設定密碼並取消勾選 Temporary，讓密碼永久有效。
4. 另外新增至少一位非管理員使用者，供醫師或其他角色登入使用。

## 📄 License

MIT License - see LICENSE file for details.
