#!/bin/bash
# Configure Hebrew column mappings

API_BASE="http://localhost:8788/api"

echo "═══════════════════════════════════════════════════════════════"
echo "  CONFIGURING HEBREW MAPPINGS"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Step 1: Save column mappings
echo "🔧 Step 1: Saving column mappings..."
curl -X POST "${API_BASE}/configure/save-mappings" \
  -H "Content-Type: application/json" \
  -d '{
    "mappings": [
      {"excel_column_name": "תאור", "mapped_field": "investment_name"},
      {"excel_column_name": "גוף מנהל", "mapped_field": "counterparty"},
      {"excel_column_name": "סוג תנועה", "mapped_field": "transaction_type"},
      {"excel_column_name": "תאריך התנועה", "mapped_field": "date"},
      {"excel_column_name": "סכום תנועה במטבע", "mapped_field": "amount"},
      {"excel_column_name": "מטבע התנועה", "mapped_field": "currency"},
      {"excel_column_name": "סוג תנועה מורחב", "mapped_field": "description"}
    ]
  }' | python3 -m json.tool

echo ""
echo "✅ Column mappings saved"
echo ""

# Step 2: Save transaction type mappings
echo "🏷️  Step 2: Saving transaction type mappings..."
curl -X POST "${API_BASE}/configure/save-transaction-type-mappings" \
  -H "Content-Type: application/json" \
  -d '{
    "mappings": [
      {"raw_type": "משיכת תשואה", "mapped_category": "distribution"},
      {"raw_type": "משיכה", "mapped_category": "distribution"},
      {"raw_type": "הפקדה", "mapped_category": "capital_call"},
      {"raw_type": "עמלה", "mapped_category": "fee"}
    ]
  }' | python3 -m json.tool

echo ""
echo "✅ Transaction type mappings saved"
echo ""

# Step 3: Check configuration status
echo "📋 Step 3: Checking configuration status..."
curl -s "${API_BASE}/configure/status" | python3 -m json.tool

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  CONFIGURATION COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "  1. Upload fresh-transactions.xlsx via the frontend or test script"
echo "  2. Preview will now show correct mappings"
echo "  3. Save investments from preview"
echo "  4. Commit transactions"
echo ""
