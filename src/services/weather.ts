import axios from "axios";

export interface BallparkInfo {
  stadiumName: string;
  city: string;
  elevation: number; // in feet
  parkFactor: number; // baseline 1.00
  dimensions: {
    left: number;
    center: number;
    right: number;
  };
}

export interface BallparkWeather {
  temp: number; // in Fahrenheit
  windSpeed: number; // in mph
  windDir: "IN" | "OUT" | "CROSS" | "CALM";
  condition: string;
  isMock: boolean;
}

const BALLPARKS: Record<string, BallparkInfo> = {
  "PNC Park": {
    stadiumName: "PNC Park",
    city: "Pittsburgh",
    elevation: 743,
    parkFactor: 0.94,
    dimensions: { left: 325, center: 399, right: 320 }
  },
  "Dodger Stadium": {
    stadiumName: "Dodger Stadium",
    city: "Los Angeles",
    elevation: 275,
    parkFactor: 0.95,
    dimensions: { left: 330, center: 395, right: 330 }
  },
  "Coors Field": {
    stadiumName: "Coors Field",
    city: "Denver",
    elevation: 5200,
    parkFactor: 1.25,
    dimensions: { left: 347, center: 415, right: 350 }
  },
  "Wrigley Field": {
    stadiumName: "Wrigley Field",
    city: "Chicago",
    elevation: 602,
    parkFactor: 1.04,
    dimensions: { left: 355, center: 400, right: 353 }
  },
  "Fenway Park": {
    stadiumName: "Fenway Park",
    city: "Boston",
    elevation: 20,
    parkFactor: 1.10,
    dimensions: { left: 310, center: 390, right: 302 }
  },
  "Yankee Stadium": {
    stadiumName: "Yankee Stadium",
    city: "Bronx",
    elevation: 54,
    parkFactor: 1.08,
    dimensions: { left: 318, center: 408, right: 314 }
  },
  "Oracle Park": {
    stadiumName: "Oracle Park",
    city: "San Francisco",
    elevation: 10,
    parkFactor: 0.88,
    dimensions: { left: 339, center: 391, right: 309 }
  },
  "Petco Park": {
    stadiumName: "Petco Park",
    city: "San Diego",
    elevation: 15,
    parkFactor: 0.85,
    dimensions: { left: 334, center: 396, right: 322 }
  }
};

class WeatherService {
  private openWeatherKey = process.env.OPENWEATHER_API_KEY;

  getBallparkInfo(stadiumName: string, homeTeamName?: string): BallparkInfo {
    // Try to match by stadium name
    const key = Object.keys(BALLPARKS).find(k => 
      stadiumName.toLowerCase().includes(k.toLowerCase()) || 
      k.toLowerCase().includes(stadiumName.toLowerCase())
    );
    if (key) return BALLPARKS[key];

    // Try to match by home team name
    if (homeTeamName) {
      if (homeTeamName.includes("Dodgers")) return BALLPARKS["Dodger Stadium"];
      if (homeTeamName.includes("Pirates")) return BALLPARKS["PNC Park"];
      if (homeTeamName.includes("Rockies")) return BALLPARKS["Coors Field"];
      if (homeTeamName.includes("Cubs")) return BALLPARKS["Wrigley Field"];
      if (homeTeamName.includes("Red Sox")) return BALLPARKS["Fenway Park"];
      if (homeTeamName.includes("Yankees")) return BALLPARKS["Yankee Stadium"];
      if (homeTeamName.includes("Giants")) return BALLPARKS["Oracle Park"];
      if (homeTeamName.includes("Padres")) return BALLPARKS["Petco Park"];
    }

    // Default neutral ballpark
    return {
      stadiumName: stadiumName || "Neutral Venue",
      city: "Unknown",
      elevation: 300,
      parkFactor: 1.00,
      dimensions: { left: 330, center: 400, right: 330 }
    };
  }

  async getBallparkWeather(stadiumName: string, homeTeamName?: string): Promise<BallparkWeather> {
    const ballpark = this.getBallparkInfo(stadiumName, homeTeamName);

    if (this.openWeatherKey) {
      try {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(ballpark.city)}&units=imperial&appid=${this.openWeatherKey}`;
        const response = await axios.get(url, { timeout: 5000 });
        const data = response.data;

        const temp = Math.round(data.main?.temp || 70);
        const windSpeed = Math.round(data.wind?.speed || 5);
        const windDeg = data.wind?.deg || 0;
        const condition = data.weather?.[0]?.description || "clear sky";

        // Convert wind degrees to ballpark relative wind direction
        // In a real system, windDir is calculated against the stadium orientation.
        // For simplicity: north/east is OUT in Dodgers/PNC, south/west is IN.
        let windDir: BallparkWeather["windDir"] = "CALM";
        if (windSpeed > 3) {
          if (windDeg > 45 && windDeg < 225) windDir = "OUT";
          else if (windDeg >= 225 && windDeg < 315) windDir = "CROSS";
          else windDir = "IN";
        }

        return { temp, windSpeed, windDir, condition, isMock: false };
      } catch (err) {
        console.warn(`[Weather Service] OpenWeatherMap call failed for ${ballpark.city}. Falling back to seasonal mock.`, err);
      }
    }

    // High fidelity seasonal weather fallback
    return this.generateSeasonalWeather(ballpark);
  }

  private generateSeasonalWeather(ballpark: BallparkInfo): BallparkWeather {
    const date = new Date();
    const month = date.getMonth(); // 0-indexed (Jan = 0, Jun = 5)

    let temp = 72;
    let windSpeed = 6;
    let windDir: BallparkWeather["windDir"] = "CROSS";
    let condition = "clear sky";

    // Seasonal adjustments
    if (month >= 5 && month <= 7) { // Summer
      temp = ballpark.city === "San Francisco" ? 64 : ballpark.city === "Denver" ? 82 : 78;
      windSpeed = ballpark.city === "Chicago" ? 10 : 5;
      condition = ballpark.city === "Denver" ? "partly cloudy" : "sunny";
    } else if (month >= 8 && month <= 9) { // Autumn
      temp = ballpark.city === "San Francisco" ? 68 : ballpark.city === "Denver" ? 68 : 66;
      windSpeed = 7;
      condition = "clear sky";
    } else { // Spring (April/May)
      temp = ballpark.city === "San Francisco" ? 58 : ballpark.city === "Denver" ? 55 : 59;
      windSpeed = ballpark.city === "Chicago" ? 12 : 8;
      condition = "scattered clouds";
    }

    // Ballpark specific wind patterns
    if (ballpark.stadiumName.includes("Wrigley")) {
      // Wrigley wind is famous. Let's make it wind out 35% of the time, in 35%, cross 30%
      const seed = Math.random();
      if (seed < 0.35) {
        windDir = "OUT";
        windSpeed = 12 + Math.floor(Math.random() * 8);
      } else if (seed < 0.70) {
        windDir = "IN";
        windSpeed = 10 + Math.floor(Math.random() * 6);
      } else {
        windDir = "CROSS";
        windSpeed = 8 + Math.floor(Math.random() * 5);
      }
    } else if (ballpark.stadiumName.includes("Oracle")) {
      // San Francisco wind blows in/across from left field usually
      windDir = "IN";
      windSpeed = 12;
    } else {
      const seed = Math.random();
      windDir = seed < 0.25 ? "OUT" : seed < 0.50 ? "IN" : seed < 0.85 ? "CROSS" : "CALM";
    }

    return { temp, windSpeed, windDir, condition, isMock: true };
  }
}

export const weatherService = new WeatherService();
