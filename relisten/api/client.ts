import wretch from 'wretch';
import {ArtistWithCounts, FullArtist} from "./models/artist";

export class RelistenApiClient {
    static API_BASE = 'https://api.relisten.net/api';

    private api = wretch(RelistenApiClient.API_BASE);
    // TODO: wretch error handling

    public artists(): Promise<ArtistWithCounts[]> {
        return this.api.get('/v3/artists').json();
    }

    public fullNormalizedArtist(artistUuid: string): Promise<FullArtist> {
        return this.api.get(`/v3/artists/${artistUuid}/normalized`).json();
    }
}

