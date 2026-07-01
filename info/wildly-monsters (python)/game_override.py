from game_executables import GameExecutables
from src.calculations.statistics import get_random_outcome


class GameStateOverride(GameExecutables):
    """
    This class is is used to override or extend universal state.py functions.
    e.g: A specific game may have custom book properties to reset
    """

    def reset_book(self):
        super().reset_book()

    def assign_special_sym_function(self):
        self.special_symbol_functions = {
            "W": [self.assign_mult_property],
        }

    def assign_mult_property(self, symbol) -> dict:
        """Assign multiplier value to Wild symbol in freegame."""
        multiplier_value = 1
        if self.gametype == self.config.freegame_type:
            multiplier_value = get_random_outcome(
                self.get_current_distribution_conditions()["mult_values"][self.gametype]
            )
        symbol.assign_attribute({"multiplier": multiplier_value})

    def assign_mult_directly(self, symbol, value) -> dict:
        """Assign multiplier value to Wild symbol in freegame."""
        symbol.assign_attribute({"multiplier": value})

    def check_repeat(self):
        """Checks if the spin failed a criteria constraint at any point."""
        #print("Checking repeat with final win of {}, current repeat count of {}, and repeat status of {}.".format(self.final_win, self.repeat_count, self.repeat))
        if self.repeat is False:
            win_criteria = self.get_current_betmode_distributions().get_win_criteria()
            if win_criteria is not None and self.final_win != win_criteria:
                self.repeat = True

            if self.get_current_distribution_conditions()["force_freegame"] and not (self.triggered_freegame):
                self.repeat = True
                

        if self.repeat is False:
            exists = False
            for i in self.config.sim_ranges:
                if i[0] <= (self.final_win*100) <= i[1]:
                    i[3] += 1
                    exists = True
                    if i[3] >= i[2]:
                        self.repeat = True
                        i[3] -= 1
                    break
            if not exists:
                self.repeat = True

        self.repeat_count += 1
        self.check_current_repeat_count()
