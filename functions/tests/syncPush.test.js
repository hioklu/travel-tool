require('dotenv').config();
const admin = require('firebase-admin');
const test = require('firebase-functions-test')({ projectId: 'demo-travel-tool' });

if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'demo-travel-tool' });
}

// Ensure original values are retained before we mock firestore
const originalFieldValue = admin.firestore.FieldValue;
const originalTimestamp = admin.firestore.Timestamp;

// We need to carefully mock DB behavior for syncPush
// syncPush queries the parent trip: db.collection('trips').doc(tripId).get()
// and then updates the event: snap.ref.update(...)
const mockTripData = {
    notionConfigDatabaseId: 'mock_notion_db_456',
    googleCalendarId: 'mock_gcal_id_123'
};

const mockTripGet = jest.fn().mockResolvedValue({
    exists: true,
    data: () => mockTripData
});

const mockTripDoc = jest.fn().mockReturnValue({ get: mockTripGet });
const mockCollection = jest.fn().mockReturnValue({ doc: mockTripDoc });

const mockFirestore = { collection: mockCollection };
jest.spyOn(admin, 'firestore').mockReturnValue(mockFirestore);
admin.firestore.FieldValue = originalFieldValue;
admin.firestore.Timestamp = originalTimestamp;

// Mock Notion Service so we don't actually hit Notion API
const notionService = require('../notionService');
jest.spyOn(notionService, 'createItineraryItemInNotion').mockResolvedValue('mock_notion_detail_page_789');
jest.spyOn(notionService, 'updateItineraryItemInNotion').mockResolvedValue(true);

const { onItineraryCreated, onItineraryUpdated } = require('../syncPush.js');

describe('syncPush Functions', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        test.cleanup();
    });

    it('onItineraryCreated should push new event to Notion and update Firebase ref', async () => {
        const snap = {
            data: () => ({
                title: 'New Flight',
                start: '09:00',
            }),
            ref: {
                update: jest.fn().mockResolvedValue(true)
            }
        };

        const context = {
            params: {
                tripId: 'trip_123',
                date: '2026-03-10'
            }
        };

        // Call the wrapped function
        const wrappedCrated = test.wrap(onItineraryCreated);
        await wrappedCrated(snap, context);

        // Assert parent trip was queried
        expect(mockCollection).toHaveBeenCalledWith('trips');
        expect(mockTripDoc).toHaveBeenCalledWith('trip_123');

        // Assert Notion service was called
        expect(notionService.createItineraryItemInNotion).toHaveBeenCalledWith(
            'mock_notion_db_456',
            'New Flight',
            '2026-03-10',
            '09:00'
        );

        // Assert Firestore was updated
        expect(snap.ref.update).toHaveBeenCalledWith(expect.objectContaining({
            notionPageId_detail: 'mock_notion_detail_page_789',
            gCalEventId: expect.any(String),
        }));
    });

    it('onItineraryUpdated should update Notion if notionPageId_detail exists', async () => {
        const change = {
            before: {
                data: () => ({
                    title: 'Old Title',
                    notionPageId_detail: 'mock_notion_detail_page_789'
                })
            },
            after: {
                data: () => ({
                    title: 'New Title',
                    start: '10:00',
                    notionPageId_detail: 'mock_notion_detail_page_789'
                })
            }
        };

        const context = {
            params: {
                tripId: 'trip_123',
                date: '2026-03-10'
            }
        };

        const wrappedUpdated = test.wrap(onItineraryUpdated);
        await wrappedUpdated(change, context);

        expect(notionService.updateItineraryItemInNotion).toHaveBeenCalledWith(
            'mock_notion_detail_page_789',
            'New Title',
            '10:00'
        );
    });

});
