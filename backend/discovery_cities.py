"""City registry for hospital discovery. Add new cities here; nothing else needs to change."""

CITIES = {
    "jaipur": {
        "key": "jaipur",
        "name": "Jaipur",
        "state": "Rajasthan",
        "country": "India",
        "country_code": "in",
        "center": {"lat": 26.9124, "lng": 75.7873},
        "bbox": {"south": 26.72, "west": 75.62, "north": 27.08, "east": 75.98},
        "queries": [
            "hospital", "hospitals in Jaipur", "multi speciality hospital", "government hospital",
            "private hospital", "emergency hospital", "nursing home", "medical centre",
            "children hospital", "eye hospital", "cancer hospital", "heart hospital", "clinic",
        ],
        "grid": 4,
    },
}


def get_city(key: str):
    return CITIES.get(key.lower())
