#!/bin/bash
# Deploy the Driver Assignment Notifier Cloud Function + Cloud Scheduler job
#
# Prerequisites:
#   1. gcloud CLI installed and authenticated
#   2. GCP project selected: gcloud config set project YOUR_PROJECT
#   3. APIs enabled: Cloud Functions, Cloud Scheduler, Firestore, Secret Manager
#   4. Secrets created:
#      gcloud secrets create mygeotab-service-account --data-file=- <<< '{"server":"my.geotab.com","database":"roustampallonji_07","userName":"...","password":"..."}'
#      gcloud secrets create gmail-smtp-credentials --data-file=- <<< '{"user":"your@gmail.com","appPassword":"xxxx xxxx xxxx xxxx"}'
#   5. Firestore database created (Native mode)

set -euo pipefail

FUNCTION_NAME="driver-assignment-notifier"
REGION="us-central1"
RUNTIME="nodejs20"
ENTRY_POINT="checkDriverChanges"
SCHEDULER_JOB="driver-assignment-check"

echo "==> Deploying Cloud Function: ${FUNCTION_NAME}"
gcloud functions deploy "${FUNCTION_NAME}" \
  --gen2 \
  --region="${REGION}" \
  --runtime="${RUNTIME}" \
  --entry-point="${ENTRY_POINT}" \
  --trigger-http \
  --allow-unauthenticated \
  --memory=256Mi \
  --timeout=120s \
  --source=.

FUNCTION_URL=$(gcloud functions describe "${FUNCTION_NAME}" --region="${REGION}" --gen2 --format='value(serviceConfig.uri)')
echo "==> Function deployed at: ${FUNCTION_URL}"

echo "==> Creating/updating Cloud Scheduler job: ${SCHEDULER_JOB}"
if gcloud scheduler jobs describe "${SCHEDULER_JOB}" --location="${REGION}" &>/dev/null; then
  gcloud scheduler jobs update http "${SCHEDULER_JOB}" \
    --location="${REGION}" \
    --schedule="* * * * *" \
    --uri="${FUNCTION_URL}" \
    --http-method=POST \
    --attempt-deadline=120s
  echo "==> Scheduler job updated"
else
  gcloud scheduler jobs create http "${SCHEDULER_JOB}" \
    --location="${REGION}" \
    --schedule="* * * * *" \
    --uri="${FUNCTION_URL}" \
    --http-method=POST \
    --attempt-deadline=120s
  echo "==> Scheduler job created"
fi

echo ""
echo "=== Deployment complete ==="
echo "Function URL: ${FUNCTION_URL}"
echo "Scheduler: runs every 1 minute"
echo ""
echo "Test manually: curl -X POST ${FUNCTION_URL}"
