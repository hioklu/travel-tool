const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const notionService = require('./notionService');

// Lazy inject admin app instances
let db;
function getFirestoreDb() {
    if (!db) {
        if (!admin.apps.length) {
            admin.initializeApp();
        }
        db = admin.firestore();
    }
    return db;
}


/**
 * Webhook endpoint for the Primary Google Calendar.
 * Triggered when ANY event is created/updated/deleted in the main calendar.
 */
exports.initTrip = functions.https.onRequest(async (req, res) => {
    // 1. Google Validation Handshake
    if (req.headers['x-goog-resource-state'] === 'sync') {
        return res.status(200).send('Sync OK');
    }

    try {
        // 2. Fetch incremental changes from Google Calendar
        // (Simplified for this prototype: assuming we get the event summary directly from a simulated payload 
        // to bypass needing a stored syncToken and full API fetch right now)

        // Mock payload structure for demonstration: { eventSummary: "3/10~3/16 北海道 出國", startDate: "2026-03-10", endDate: "2026-03-16" }
        const { eventSummary, startDate, endDate } = req.body;

        if (!eventSummary || !eventSummary.includes('出國')) {
            console.log("Not a travel event, ignoring.");
            return res.status(200).send('Ignored');
        }

        console.log(`Processing new travel event: ${eventSummary}`);
        const tripId = `trip_${Date.now()}`; // Default ID generation

        // 3. Create Notion Page and inner Database
        const notionResult = await notionService.createNotionTripProject(eventSummary);

        // 4. Create Dedicated Google Calendar
        // (Mocking this call if auth isn't fully set up with a refresh token yet)
        let dedicatedCalendarId = 'mock_gcal_id_123';
        /*
        const newCal = await calendar.calendars.insert({
            requestBody: {
                summary: eventSummary,
                timeZone: 'Asia/Taipei'
            }
        });
        dedicatedCalendarId = newCal.data.id;
        */

        // 5. Write to Firebase
        const tripPayload = {
            title: eventSummary,
            description: `Generated from Google Calendar (${startDate} to ${endDate})`,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: 'system_auto', // In real app, map this to a user UID
            collaborators: [],
            isPublic: false,
            // External Sync IDs
            notionPageId: notionResult.pageId,
            notionConfigDatabaseId: notionResult.databaseId,
            googleCalendarId: dedicatedCalendarId,
            // Sync Timestamps
            lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const firestoreDb = getFirestoreDb();
        await firestoreDb.collection('trips').doc(tripId).set(tripPayload);
        console.log(`Successfully initialized Trip ${tripId} in Firebase.`);

        return res.status(200).send('Trip Initialized');

    } catch (error) {
        console.error('Error in initTrip webhook:', error.stack || error);
        return res.status(500).send('Internal Server Error');
    }
});

// Export mock function to test logic later
exports.testInitTrip = functions.https.onRequest(async (req, res) => {
    // Simulate Google Webhook Payload
    const mockPayload = {
        eventSummary: "3/10~3/16 北海道 出國",
        startDate: "2026-03-10",
        endDate: "2026-03-16"
    };

    req.body = mockPayload;
    return exports.initTrip(req, res);
});

// Export Push & Pull sync functions
const syncPush = require('./syncPush');
exports.onItineraryCreated = syncPush.onItineraryCreated;
exports.onItineraryUpdated = syncPush.onItineraryUpdated;

const syncPullNotion = require('./syncPullNotion');
exports.syncPullNotion = syncPullNotion.syncPullNotion;

const syncWebhookGCal = require('./syncWebhookGCal');
exports.syncWebhookGCal = syncWebhookGCal.syncWebhookGCal;
