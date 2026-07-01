from game_calculations import GameCalculations
from src.calculations.lines import Lines
from src.events.events import fs_trigger_event


class GameExecutables(GameCalculations):

    def evaluate_lines_board(self):
        """Populate win-data, record wins, transmit events."""
        self.win_data = Lines.get_lines(self.board, self.config, global_multiplier=self.global_multiplier)
        Lines.record_lines_wins(self)
        self.win_manager.update_spinwin(self.win_data["totalWin"])
        Lines.emit_linewin_events(self)

    def check_fs_condition(self, scatter_key = "scatter"):
        if len(self.special_syms_on_board[scatter_key]) >= min(self.config.freespin_triggers[self.gametype].keys()):
            return True
        elif len(self.special_syms_on_board["scatter2"]) >= 3:
            return True
        else:
            return False

    def run_freespin_from_base(self, scatter_key: str = "scatter") -> None:
        """Trigger the freespin function and update total fs amount."""
        self.record(
            {
                "kind": self.count_special_symbols(scatter_key),
                "symbol": scatter_key,
                "gametype": self.gametype,
            }
        )
        self.update_freespin_amount()
        if self.count_special_symbols("scatter2") >= 3:
            self.run_super_freespin()
        elif self.count_special_symbols("scatter") >= 3:
            self.run_freespin()
        else:
            print("Scatters didn't match any criteria, but still triggered fs since force_freegame was active.")
            self.run_freespin()
    
    def update_freespin_amount(self, scatter_key: str = "scatter") -> None:
        """Set initial number of spins for a freegame and transmit event."""
        self.tot_fs = 10
        if self.gametype == self.config.basegame_type:
            basegame_trigger, freegame_trigger = True, False
        else:
            basegame_trigger, freegame_trigger = False, True
        fs_trigger_event(self, basegame_trigger=basegame_trigger, freegame_trigger=freegame_trigger)

    def update_fs_retrigger_amt(self, scatter_key: str = "scatter") -> None:
        """Update total freespin amount on retrigger."""
        if self.count_special_symbols(scatter_key) >= 3:
            self.tot_fs += 4
            fs_trigger_event(self, freegame_trigger=True, basegame_trigger=False, fs_added=4)

    def update_super_fs_retrigger_amt(self, scatter_key: str = "scatter") -> None:
        """Update total freespin amount on retrigger."""
        if self.count_special_symbols("scatter2") >= 3:
            self.tot_fs += 4
            fs_trigger_event(self, freegame_trigger=True, basegame_trigger=False, fs_added=4)
