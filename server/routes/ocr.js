const express = require('express')
const Anthropic = require('@anthropic-ai/sdk')

const router = express.Router()
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are an expert at extracting structured data from receipt and invoice images.
Extract ALL relevant expense fields and return ONLY valid JSON matching the schema exactly.
Be precise with numbers. Use ISO 8601 for dates (YYYY-MM-DD). If a field is unclear, make a best guess and lower the confidence score.`

const EXTRACT_PROMPT = `Extract the expense data from this receipt image and return JSON matching this exact schema:
{
  "vendor": "string — merchant/vendor name",
  "date": "YYYY-MM-DD",
  "subtotal": number,
  "tax": number,
  "total": number,
  "currency": "USD",
  "category": "one of: Advertising|Auto|Bank Charges|Entertainment|Equipment|Insurance|Meals|Office Supplies|Other Business Expenses|Professional Fees|Rent|Software|Travel|Utilities",
  "paymentMethod": "one of: Cash|Credit Card|Debit Card|Check|Other",
  "lineItems": [{ "description": "string", "quantity": number, "unitPrice": number, "amount": number }],
  "notes": "any useful additional info from the receipt",
  "confidence": number between 0 and 1
}

Return ONLY the JSON object, no markdown fences, no explanation.`

router.post('/extract', async (req, res) => {
  const { image } = req.body
  if (!image) return res.status(400).json({ message: 'image is required' })

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: image },
            },
            { type: 'text', text: EXTRACT_PROMPT },
          ],
        },
      ],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const data = JSON.parse(text.trim())

    // ensure required fields have defaults
    res.json({
      vendor: data.vendor ?? '',
      date: data.date ?? new Date().toISOString().slice(0, 10),
      subtotal: data.subtotal ?? 0,
      tax: data.tax ?? 0,
      total: data.total ?? 0,
      currency: data.currency ?? 'USD',
      category: data.category ?? 'Other Business Expenses',
      paymentMethod: data.paymentMethod ?? 'Credit Card',
      lineItems: data.lineItems ?? [],
      notes: data.notes ?? '',
      confidence: data.confidence ?? 0.8,
    })
  } catch (err) {
    console.error('OCR error:', err)
    res.status(500).json({ message: err.message ?? 'Receipt extraction failed' })
  }
})

module.exports = router
