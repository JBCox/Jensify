// Google Maps Proxy Edge Function
// Securely proxies Google Maps API calls to avoid exposing API key in frontend
//
// SECURITY: API key is stored as Supabase secret, never exposed to client
// Set with: supabase secrets set GOOGLE_MAPS_API_KEY=your_key

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface GeocodeRequest {
  action: 'geocode' | 'reverse-geocode' | 'distance-matrix';
  address?: string;
  lat?: number;
  lng?: number;
  origin?: { lat: number; lng: number };
  destination?: { lat: number; lng: number };
}

interface GeocodeResponse {
  results: Array<{
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }>;
  status: string;
}

interface DistanceMatrixResponse {
  rows: Array<{
    elements: Array<{
      status: string;
      distance?: { value: number; text: string };
      duration?: { value: number; text: string };
    }>;
  }>;
  status: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user is authenticated via Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Google Maps API key from secrets
    const googleMapsApiKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!googleMapsApiKey) {
      console.error('GOOGLE_MAPS_API_KEY secret not configured');
      return new Response(
        JSON.stringify({ error: 'Maps service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: GeocodeRequest = await req.json();
    const { action } = body;

    let result;

    switch (action) {
      case 'geocode': {
        if (!body.address) {
          return new Response(
            JSON.stringify({ error: 'Address is required for geocoding' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(body.address)}&key=${googleMapsApiKey}`;
        const geocodeResponse = await fetch(geocodeUrl);
        const geocodeData: GeocodeResponse = await geocodeResponse.json();

        if (geocodeData.status !== 'OK' || !geocodeData.results?.length) {
          return new Response(
            JSON.stringify({ error: `Geocoding failed: ${geocodeData.status}`, status: geocodeData.status }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        result = {
          lat: geocodeData.results[0].geometry.location.lat,
          lng: geocodeData.results[0].geometry.location.lng,
          formatted_address: geocodeData.results[0].formatted_address
        };
        break;
      }

      case 'reverse-geocode': {
        if (body.lat === undefined || body.lng === undefined) {
          return new Response(
            JSON.stringify({ error: 'Latitude and longitude are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const reverseUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${body.lat},${body.lng}&key=${googleMapsApiKey}`;
        const reverseResponse = await fetch(reverseUrl);
        const reverseData: GeocodeResponse = await reverseResponse.json();

        if (reverseData.status !== 'OK' || !reverseData.results?.length) {
          // Return coordinates as fallback
          result = {
            formatted_address: `${body.lat.toFixed(6)}, ${body.lng.toFixed(6)}`,
            status: reverseData.status
          };
        } else {
          result = {
            formatted_address: reverseData.results[0].formatted_address,
            lat: reverseData.results[0].geometry.location.lat,
            lng: reverseData.results[0].geometry.location.lng
          };
        }
        break;
      }

      case 'distance-matrix': {
        if (!body.origin || !body.destination) {
          return new Response(
            JSON.stringify({ error: 'Origin and destination are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Check if start and end are essentially the same location (within ~100 meters)
        const latDiff = Math.abs(body.origin.lat - body.destination.lat);
        const lngDiff = Math.abs(body.origin.lng - body.destination.lng);
        if (latDiff < 0.001 && lngDiff < 0.001) {
          result = { distanceMiles: 0, durationMinutes: 0, apiSuccess: true };
          break;
        }

        const distanceUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${body.origin.lat},${body.origin.lng}&destinations=${body.destination.lat},${body.destination.lng}&mode=driving&units=imperial&key=${googleMapsApiKey}`;
        const distanceResponse = await fetch(distanceUrl);
        const distanceData: DistanceMatrixResponse = await distanceResponse.json();

        if (distanceData.status !== 'OK' || !distanceData.rows?.[0]?.elements?.[0]) {
          result = { distanceMiles: 0, durationMinutes: 0, apiSuccess: false, status: distanceData.status };
          break;
        }

        const element = distanceData.rows[0].elements[0];
        if (element.status !== 'OK') {
          result = { distanceMiles: 0, durationMinutes: 0, apiSuccess: false, status: element.status };
        } else {
          const distanceMiles = Math.round(((element.distance?.value ?? 0) / 1609.34) * 100) / 100;
          const durationMinutes = Math.round((element.duration?.value ?? 0) / 60);
          result = { distanceMiles, durationMinutes, apiSuccess: true };
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Google Maps proxy error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
