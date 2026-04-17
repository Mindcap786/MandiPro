import Dexie, { Table } from 'dexie';

export interface PendingSale {
    id: string; // uuid
    contact_id: string;
    total_amount: number;
    items: any[]; // JSON
    sale_date: string;
    created_at: number;
    sync_status: 'pending' | 'synced' | 'failed';
}

export interface OfflineContact {
    id: string;
    name: string;
    type: string;
    city: string;
}

export class MandiDatabase extends Dexie {
    sales!: Table<PendingSale>;
    contacts!: Table<OfflineContact>;

    constructor() {
        super('MandiOS_DB');
        this.version(1).stores({
            sales: 'id, created_at, sync_status',
            contacts: 'id, name, type', // Indexed fields
        });
    }
}

export const db = new MandiDatabase();
