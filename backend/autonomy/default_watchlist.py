from __future__ import annotations

from typing import List


def default_watch_profiles() -> List[dict]:
    return [
        {
            "id": "watch-helixops",
            "label": "Hospital AI Expansion",
            "company_name": "HelixOps AI",
            "industry": "Business software",
            "region": "North America",
            "request": {
                "company_name": "HelixOps AI",
                "industry": "Business software",
                "region": "North America",
                "company_stage": "Seed",
                "business_problem": (
                    "We are a young software company thinking about selling our AI product to mid-sized hospitals. "
                    "Our product helps hospitals handle insurance approval work faster, but this new market would "
                    "require more integrations, a longer sales process, stronger compliance controls, and better "
                    "customer support. We have about 11 months of cash left, our profit margin is around 68%, we "
                    "expect it will take 15 months to earn back sales and marketing costs, and we are considering "
                    "charging about $28,000 per customer each year. The team needs to decide whether to launch now, "
                    "move forward with changes, or wait."
                ),
                "objectives": [
                    "Grow revenue",
                    "Enter a new market carefully",
                    "Protect cash",
                    "Avoid compliance mistakes",
                ],
                "current_constraints": [
                    "Small team",
                    "Limited runway",
                    "Long sales cycle",
                    "More customer support required",
                ],
                "known_metrics": {
                    "runway_months": 11,
                    "gross_margin": 68,
                    "cac_payback_months": 15,
                    "price_point": 28000,
                },
                "scenario_name": "Autonomous monitor base",
            },
        },
        {
            "id": "watch-campus-arena",
            "label": "College Game Center",
            "company_name": "Campus Arena",
            "industry": "Entertainment",
            "region": "India",
            "request": {
                "company_name": "Campus Arena",
                "industry": "Entertainment",
                "region": "India",
                "company_stage": "Idea",
                "business_problem": (
                    "I want to start a game center near a college. The plan is to offer PC gaming, console gaming, "
                    "small tournaments, and snacks. The area has strong student traffic, but students are price-sensitive "
                    "and the business would need a decent upfront fit-out, gaming equipment, rent, and staff. I need to "
                    "know whether this can work, how risky it is, and what kind of pricing and launch plan would make sense."
                ),
                "objectives": [
                    "Reach break-even fast",
                    "Attract repeat visits",
                    "Build a student community",
                ],
                "current_constraints": [
                    "Limited startup capital",
                    "Uncertain weekday demand",
                    "High upfront equipment cost",
                ],
                "known_metrics": {
                    "runway_months": 10,
                    "gross_margin": 55,
                    "cac_payback_months": 6,
                    "price_point": 299,
                },
                "scenario_name": "Autonomous monitor base",
            },
        },
        {
            "id": "watch-urban-tiffin",
            "label": "Cloud Kitchen Expansion",
            "company_name": "Urban Tiffin Co.",
            "industry": "Food service",
            "region": "Middle East & Africa",
            "request": {
                "company_name": "Urban Tiffin Co.",
                "industry": "Food service",
                "region": "Middle East & Africa",
                "company_stage": "Established business",
                "business_problem": (
                    "Our cloud kitchen has built a loyal local customer base, and we are considering opening a second "
                    "kitchen to cover another delivery zone. The new kitchen could increase revenue, but food-delivery "
                    "commissions, staffing, and quality control are already under pressure. We need to decide whether "
                    "expansion now is smart or too risky."
                ),
                "objectives": [
                    "Grow order volume",
                    "Keep food quality high",
                    "Maintain profit",
                ],
                "current_constraints": [
                    "Delivery app commissions",
                    "Staffing gaps",
                    "Quality consistency across locations",
                ],
                "known_metrics": {
                    "runway_months": 8,
                    "gross_margin": 44,
                    "cac_payback_months": 4,
                    "price_point": 12,
                },
                "scenario_name": "Autonomous monitor base",
            },
        },
    ]
