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
const mockBatchSet = jest.fn();
const mockBatchCommit = jest.fn().mockResolvedValue(true);
const mockBatch = jest.fn().mockReturnValue({
    update: mockBatchUpdate,
    set: mockBatchSet,
    commit: mockBatchCommit
});

// Mock the trips query
const mockTripDoc = {
    id: 'trip_123',
    data: () => ({
        notionConfigDatabaseId: 'mock_notion_db_456',
        lastSyncedAt: admin.firestore.Timestamp.fromDate(new Date('2026-03-09'))
    }),
    ref: 'mock_trip_ref'
};
const mockTripsGet = jest.fn().mockResolvedValue({
    empty: false,
    docs: [mockTripDoc]
});
const mockTripsWhere = jest.fn().mockReturnValue({ get: mockTripsGet });

// Mock the itinerary query inside the loop
const mockEventDoc = {
    id: 'event_1',
    data: () => ({
        updatedAt: admin.firestore.Timestamp.fromDate(new Date('2026-03-09T10:00:00Z'))
    }),
    ref: 'mock_event_ref'
};

const mockItineraryGet = jest.fn().mockResolvedValue({
    empty: false,
    docs: [mockEventDoc]
});
const mockItineraryLimit = jest.fn().mockReturnValue({ get: mockItineraryGet });
const mockItineraryWhere = jest.fn().mockReturnValue({ limit: mockItineraryLimit });
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


// Mock Notion Service
const notionService = require('../notionService');
const mockModifications = [
    {
        id: 'mock_notion_page_detail_1',
        last_edited_time: '2026-03-10T08:00:00.000Z', // Newer than Firebase!
    }
];
jest.spyOn(notionService, 'getRecentModifications').mockResolvedValue(mockModifications);
jest.spyOn(notionService, 'parseItineraryItem').mockReturnValue({ title: 'Updated in Notion' });

const { syncPullNotion } = require('../syncPullNotion.js');

describe('syncPullNotion Job', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterAll(() => {
        test.cleanup();
    });

    it('should pull new modifications from Notion and update Firebase via batch', async () => {

        // syncPullNotion is a pubsub scheduled function.
        // We can test its internals by test.wrap
        const wrappedSync = test.wrap(syncPullNotion);

        await wrappedSync({});

        // 1. Assert Trips Query
        expect(mockCollection).toHaveBeenCalledWith('trips');
        expect(mockTripsWhere).toHaveBeenCalledWith('notionConfigDatabaseId', '!=', null);

        // 2. Assert Notion Polled
        expect(notionService.getRecentModifications).toHaveBeenCalledWith(
            'mock_notion_db_456',
            expect.any(Date)
        );

        // 3. Assert Conflict Resolution Query (itinerary)
        expect(mockTripDocFunction).toHaveBeenCalledWith('trip_123');
        expect(mockItineraryCollection).toHaveBeenCalledWith('itinerary');
        expect(mockItineraryWhere).toHaveBeenCalledWith('notionPageId_detail', '==', 'mock_notion_page_detail_1');

        // 4. Assert Batch updates (since Notion is newer, it should update)
        expect(mockBatchUpdate).toHaveBeenCalledWith('mock_event_ref', expect.objectContaining({
            title: 'Updated in Notion'
        }));

        // 5. Assert Batch commit
        expect(mockBatchCommit).toHaveBeenCalled();
    });

});
