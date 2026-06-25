import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type { AddressBarangay } from '@/types';

const ZAMBOANGA_CITY_ID = '0931700';

export function useAddressCascade() {
    const [barangays, setBarangays] = useState<AddressBarangay[]>([]);
    const [loading,   setLoading]   = useState(false);

    useEffect(() => {
        setLoading(true);
        api.get<AddressBarangay[]>(`/rider/address/barangays/${ZAMBOANGA_CITY_ID}`)
            .then(setBarangays)
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    return { barangays, loading };
}
