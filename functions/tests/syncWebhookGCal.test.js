require('dotenv').config();
const admin = require('firebase-admin');
const test = require('firebase-functions-test')({ projectId: 'demo-travel-tool' });

if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'demo-travel-tool' });
}

// Preserve original
const originalFieldValue = admin.firestore.FieldValue;
const originalTimestamp = admin.firestore.Timestamp;

// Setup Mock Firestore
const mockBatchUpdate = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(true);
const mockBatch = jest.fn().mockReturnValue({
    update: mockBatchUpdate,
    commit: mockBatchCommit
});

const mockTripDoc = {
    id: 'trip_123',
    data: () => ({
        googleCalendarId: 'mock_gcal_id_123',
        gCalSyncToken: 'old_token'
    }),
    ref: 'mock_trip_ref'
};

const mockTripsGet = jest.fn().mockResolvedValue({
    empty: false,
    docs: [mockTripDoc]
});
const mockTripsWhere = jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ get: mockTripsGet }) });

const mockEventDoc = {
    id: 'event_1',
    data: () => ({
        updatedAt: admin.firestore.Timestamp.fromDate(new Date('2020-01-01T10:00:00Z'))
    }),
    ref: 'mock_event_ref'
};

const mockItineraryGet = jest.fn().mockResolvedValue({
    empty: false,
    docs: [mockEventDoc]
});
const mockItineraryWhere = jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue({ get: mockItineraryGet }) });
const mockItineraryCollection = jest.fn().mockReturnValue({
    where: mockItineraryWhere,
});

const mockTripDocFunction = jest.fn().mockReturnValue({
    collection: mockItineraryCollection
});

const mockCollection = jest.fn((path) => {
    if (path === 'trips') {
        return {
            where: mockTripsWhere,
            doc: mockTripDocFunction
        };
    }
    return {};
});

const mockFirestore = {
    collection: mockCollection,
    batch: mockBatch
};

jest.spyOn(admin, 'firestore').mockReturnValue(mockFirestore);
admin.firestore.FieldValue = originalFieldValue;
admin.firestore.Timestamp = originalTimestamp;


// Mock express req/res
const mockStatus = jest.fn().mockReturnThis();
const mockSend = jest.fn();
const res = {
    status: mockStatus,
    send: mockSend
};

const { syncWebhookGCal } = require('../syncWebhookGCal.js');

describe('syncWebhookGCal', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        test.cleanup();
    });

    it('should handle Google validation handshake', async () => {
        const req = {
            headers: { 'x-goog-resource-state': 'sync' }
        };

        await syncWebhookGCal(req, res);
        expect(mockStatus).toHaveBeenCalledWith(200);
        expect(mockSend).toHaveBeenCalledWith('Sync OK');
    });

    it('should process webhook and update Firebase if GCal event is newer', async () => {
        const req = {
            headers: {
                'x-goog-channel-id': 'channel_123',
                'x-goog-resource-id': 'resource_123'
            }
        };

        await syncWebhookGCal(req, res);

        // 1. Assert Trip found by channel ID
        expect(mockCollection).toHaveBeenCalledWith('trips');
        expect(mockTripsWhere).toHaveBeenCalledWith('googleCalendarChannelId', '==', 'channel_123');

        // 2. Assert itinerary checked for conflict
        expect(mockTripDocFunction).toHaveBeenCalledWith('trip_123');
        expect(mockItineraryCollection).toHaveBeenCalledWith('itinerary');
        expect(mockItineraryWhere).toHaveBeenCalledWith('gCalEventId', '==', 'mock_gcal_evt_123');

        // 3. Assert Batch update was called (since mock new Date() > 2026-03-09)
        expect(mockBatchUpdate).toHaveBeenCalledWith('mock_event_ref', expect.objectContaining({
            title: 'Edited via GCal - Sushi',
            start: expect.any(String) // '19:00'
        }));

        // 4. Assert Trip Token updated
        expect(mockBatchUpdate).toHaveBeenCalledWith('mock_trip_ref', expect.objectContaining({
            gCalSyncToken: expect.stringContaining('mock_sync_token_')
        }));

        expect(mockBatchCommit).toHaveBeenCalled();
        expect(mockStatus).toHaveBeenCalledWith(200);
        expect(mockSend).toHaveBeenCalledWith('Sync Completed');
    });

});
