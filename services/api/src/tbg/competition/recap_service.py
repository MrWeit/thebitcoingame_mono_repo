"""AI match recap service — Claude API with template fallback."""

from __future__ import annotations

import logging

from tbg.db.models import Match

logger = logging.getLogger(__name__)


class RecapService:
    """Generate AI-powered match recaps using Claude API.

    Falls back to template-based recaps when API is unavailable.
    """

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key
        self.client = None
        if api_key:
            try:
                import anthropic
                self.client = anthropic.AsyncAnthropic(api_key=api_key)
            except ImportError:
                logger.warning("anthropic package not installed, using template recaps")

    async def generate_recap(self, match: Match, stats: dict) -> str:
        """Generate a match recap. Falls back to template if API unavailable."""
        if not self.client:
            return self._template_recap(match, stats)

        try:
            return await self._api_recap(match, stats)
        except Exception:
            logger.exception("Claude API recap failed, using template")
            return self._template_recap(match, stats)

    async def _api_recap(self, match: Match, stats: dict) -> str:
        """Generate recap via Claude API."""
        prompt = (
            "Write an exciting 2-3 sentence recap of a Bitcoin mining World Cup match.\n\n"
            f"Match: {stats['team_a_country']} vs {stats['team_b_country']}\n"
            f"Round: {match.round}\n"
            f"Score: {match.score_a} - {match.score_b}\n"
            f"Team A hashrate: {stats.get('hashrate_a', 0):.1e} H/s ({stats.get('miners_a', 0)} miners)\n"
            f"Team B hashrate: {stats.get('hashrate_b', 0):.1e} H/s ({stats.get('miners_b', 0)} miners)\n"
            f"Man of the Match: {stats.get('mom_name', 'N/A')} "
            f"with {stats.get('mom_diff', 0):.1e} difficulty\n\n"
            "Write in the style of a sports commentator. Focus on drama, key moments, "
            "and standout performances. Keep it under 300 characters."
        )

        response = await self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text

    def _template_recap(self, match: Match, stats: dict) -> str:
        """Fallback template-based recap when API is unavailable."""
        team_a = stats.get("team_a_country", "Team A")
        team_b = stats.get("team_b_country", "Team B")

        if match.score_a > match.score_b:
            winner, loser = team_a, team_b
        elif match.score_b > match.score_a:
            winner, loser = team_b, team_a
        else:
            return (
                f"A tense draw between {team_a} and {team_b} in the {match.round} "
                f"stage, finishing {match.score_a}-{match.score_b}."
            )

        recap = f"{winner} claimed victory over {loser} in a {match.round} clash, "
        recap += f"with a final score of {match.score_a}-{match.score_b}."

        mom_name = stats.get("mom_name")
        if mom_name:
            recap += f" {mom_name} was named Man of the Match."

        return recap
