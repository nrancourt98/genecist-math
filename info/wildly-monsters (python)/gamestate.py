import random
from game_override import GameStateOverride
from src.events.events import expanding_wild_event, reveal_event, show_battle_event, selected_mode_event, wincap_event, monster_count_event, fs_trigger_event, new_switch_event, update_switch_spins_event, switching_symbols_event, new_switch_spins_event

class GameState(GameStateOverride):
    """Handles game logic and events for a single simulation number/game-round."""

    # def run_spin(self, sim, simulation_seed=None):
    #     self.reset_seed(sim)
    #     self.repeat = True
    #     self.book.game_mode = 0
    #     self.freespin_wins = 0
    #     while self.repeat:
    #         self.reset_book()
    #         self.draw_board()
    #         # Evaluate wins, update wallet, transmit events
    #         self.evaluate_lines_board()

    #         self.win_manager.update_gametype_wins(self.gametype)
    #         if self.check_fs_condition():
    #             self.run_freespin_from_base()

    #         self.evaluate_finalwin()
    #         self.check_repeat()
    #     self.imprint_wins()

    # # This run spin function uses "S2" as the freespin trigger symbols.
    # def run_spin(self, sim, simulation_seed=None):
    #     self.reset_seed(sim)
    #     self.repeat = True
    #     self.book.game_mode = 0
    #     self.freespin_wins = 0
    #     while self.repeat:
    #         self.reset_book()
    #         self.draw_board(trigger_symbol="scatter2")
    #         self.get_special_symbols_on_board()
    #         # Evaluate wins, update wallet, transmit events
    #         self.evaluate_lines_board()

    #         self.win_manager.update_gametype_wins(self.gametype)
    #         if self.check_fs_condition():
    #             self.run_freespin_from_base()

    #         self.evaluate_finalwin()
    #         self.check_repeat()
    #     self.imprint_wins()

    # # This run spin function guarantees a switch symbol drop on the first spin and then follows the normal logic after that.
    def run_spin(self, sim, simulation_seed=None):
        self.reset_seed(sim)
        self.repeat = True
        self.book.game_mode = 0
        self.freespin_wins = 0
        while self.repeat:
            self.reset_book()
            switch_activated = True
            switch_spins = 0
            switch_wild = False
            switch_symbols = []
            prevent_switch = False
            while switch_activated:
                if switch_spins > 0:
                    self.win_manager.reset_spin_win()
                    switch_spins -= 1
                    update_switch_spins_event(self, spins=switch_spins)
                switch_dropped = False
                changes = []
                # Draws board without emitting event since I will replace some symbols.
                self.draw_board(emit_event=False)
            
                # Switch Symbol Drop Logic
                if switch_symbols == [] and not prevent_switch:
                    switch_row = random.randint(0,5)
                    switch_col = random.randint(0,4)
                    self.board[switch_row][switch_col] = self.create_symbol("SW")
                    switch_dropped = True
                elif switch_symbols != [] and switch_spins == 0:
                    if random.choice([0,1,1]) == 0:
                        for i in range(3):
                            self.board[i*2][random.randint(0, 4)] = self.create_symbol("S2")
                    else:
                        for i in range(3):
                            self.board[i*2][random.randint(0, 4)] = self.create_symbol("S")
                elif random.choice([0,1,1,1,1,1]) == 0 and not prevent_switch:
                    switch_row = random.randint(0,5)
                    switch_col = random.randint(0,4)
                    self.board[switch_row][switch_col] = self.create_symbol("SW")
                    switch_dropped = True
                

                # Reveal the inital board.
                reveal_event(self)

                if switch_activated:
                    if switch_wild:
                        sym = "W"
                    else:
                        sym = "H5"
                    for reel in range(len(self.board)):
                        for row in range(len(self.board[reel])):
                            if self.board[reel][row].name in switch_symbols:
                                self.board[reel][row] = self.create_symbol(sym)
                                changes.append({"reel": reel, "row": row, "symbol": sym})
                    if changes:
                        switching_symbols_event(self, changes)
                                

                # Calculates wins on board.
                self.evaluate_lines_board()            

                # Add win info.
                self.win_manager.update_gametype_wins(self.gametype)

                if switch_dropped:
                    if switch_spins == 0:
                        switch_wild = random.choice([True, False])
                    new_switch_spins = random.choice([1,1,1,1,1,2,2,2,2,2,2,3,3,3,3,3,4,4,4,4,5,5,5,6,6,7,7,8,8,9,10])
                    available_symbols = [s for s in ["L1","L2","L3","L4","L5","H1", "H2", "H3", "H4"] if s not in switch_symbols]
                    num_to_add = random.choice([1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,3,3,4])
                    if num_to_add > 0:
                        if num_to_add > len(available_symbols):
                            num_to_add = len(available_symbols)
                            prevent_switch = True
                        new_symbols = random.sample(available_symbols, num_to_add)
                        switch_symbols.extend(new_symbols)
                    new_switch_event(self, info={"spins": new_switch_spins, "wild": switch_wild, "switch_symbols": switch_symbols})
                    switch_spins += new_switch_spins
                    new_switch_spins_event(self, spins=switch_spins)
                    switch_activated = True
                if switch_spins == 0:
                    switch_activated = False
                # Check wincap condition and force freegame to end. 
                if (self.win_manager.basegame_wins + self.win_manager.freegame_wins) >= self.win_manager.max_allowed_win:
                        switch_spins = 0
                        switch_activated = False
                        wincap_event(self)

                self.get_special_symbols_on_board()
                if switch_spins > 0 and self.check_fs_condition():
                    self.repeat = True
                    
            
            self.get_special_symbols_on_board()
            
            if self.check_fs_condition():
                self.run_freespin_from_base()

            self.evaluate_finalwin()
            self.check_repeat()
        self.imprint_wins()

    def run_freespin(self):
        self.reset_fs_spin()
        self.book.game_mode = 1
        switch_activated = False
        switch_spins = 0
        switch_symbols = []
        switch_wild = False
        # Sends an event with the selected mode for the freegame.
        selected_mode_event(self, mode="R")
        # Freegame loop. Stops once spins reaches allowed total.
        while self.fs < self.tot_fs or switch_spins > 0:
            # Updates freespin count and transmits event.
            if switch_activated:
                self.win_manager.reset_spin_win()
                switch_spins -= 1
                update_switch_spins_event(self, spins=switch_spins)
            else:
                self.update_freespin()
            switch_dropped = False
            changes = []
            # Draws board without emitting event since I will replace some symbols.
            self.draw_board(emit_event=False)

            # if random.choice([0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]) == 0 and switch_spins == 0:
            #     for i in range(3):
            #         self.board[i*2][random.randint(0, 4)] = self.create_symbol("S2")
            # Switch Symbol Drop Logic
            if random.choice([0,1,1,1,1,1,1,1,1,1]) == 0:
                switch_row = random.randint(0,5)
                switch_col = random.randint(0,4)
                self.board[switch_row][switch_col] = self.create_symbol("SW")
                switch_dropped = True

            
            self.get_special_symbols_on_board()
            # Reveal the inital board.
            reveal_event(self)

            if switch_activated:
                if switch_wild:
                    sym = "W"
                else:
                    sym = "H5"
                for reel in range(len(self.board)):
                    for row in range(len(self.board[reel])):
                        if self.board[reel][row].name in switch_symbols:
                            self.board[reel][row] = self.create_symbol(sym)
                            changes.append({"reel": reel, "row": row, "symbol": sym})
                if changes:
                    switching_symbols_event(self, changes)
                            

            # Calculates wins on board.
            self.evaluate_lines_board()

            # Add win info.
            self.win_manager.update_gametype_wins(self.gametype)

            if switch_dropped:
                if switch_spins == 0:
                    switch_wild = random.choice([True, False])
                new_switch_spins = random.choice([1,1,1,1,1,2,2,2,2,2,2,3,3,3,3,3,4,4,4,4,5,5,5,6,6,7,7,8,8,9,10])
                available_symbols = [s for s in ["L1","L2","L3","L4","L5", "H1", "H2", "H3", "H4"] if s not in switch_symbols]
                num_to_add = random.choice([1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,3,3,4])
                if num_to_add > 0:
                    if num_to_add > len(available_symbols):
                        num_to_add = len(available_symbols)
                    new_symbols = random.sample(available_symbols, num_to_add)
                    switch_symbols.extend(new_symbols)
                new_switch_event(self, info={"spins": new_switch_spins, "wild": switch_wild, "switch_symbols": switch_symbols})
                switch_spins += new_switch_spins
                new_switch_spins_event(self, spins=switch_spins)
                switch_activated = True
            if switch_spins == 0:
                switch_activated = False
                switch_symbols = []
            # Check wincap condition and force freegame to end. 
            if (self.win_manager.basegame_wins + self.win_manager.freegame_wins) >= self.win_manager.max_allowed_win:
                    self.fs = self.tot_fs
                    switch_spins = 0
                    switch_activated = False
                    wincap_event(self)
            else:
                # Check for retrigger condition.
                if self.check_fs_condition():
                    if self.count_special_symbols("scatter2") >= 3:
                        self.upgrade_super_freespin()
                    else:
                        self.update_fs_retrigger_amt()
            # if self.count_special_symbols("scatter2") >= 3:
            #     self.repeat = True
        self.end_freespin()

        
    def run_super_freespin(self):
        self.reset_fs_spin()
        self.book.game_mode = 2
        switch_activated = False
        switch_spins = 0
        switch_symbols = []
        switch_wild = False
        prevent_switch = False
        # Sends an event with the selected mode for the freegame.
        selected_mode_event(self, mode="S")
        # Freegame loop. Stops once spins reaches allowed total.
        while self.fs < self.tot_fs or switch_spins > 0:
            # Updates freespin count and transmits event.
            if switch_activated:
                self.win_manager.reset_spin_win()
                switch_spins -= 1
                update_switch_spins_event(self, spins=switch_spins)
            else:
                self.update_freespin()
            switch_dropped = False
            changes = []
            num_to_add = 0
            # Draws board without emitting event since I will replace some symbols.
            self.draw_board(emit_event=False)

            if len(switch_symbols) == 9:
                prevent_switch = True
            # Replace "S" with "S2"
            for reel in range(len(self.board)):
                for row in range(len(self.board[reel])):
                    if self.board[reel][row].name == "S":
                        self.board[reel][row] = self.create_symbol("S2")
           
            # Switch Symbol Drop Logic
            if random.choice([0,1,1,1,1,1]) == 0 and not prevent_switch:
                switch_row = random.randint(0,5)
                switch_col = random.randint(0,4)
                self.board[switch_row][switch_col] = self.create_symbol("SW")
                switch_dropped = True

            self.get_special_symbols_on_board()
            # Reveal the inital board.
            reveal_event(self)

            if switch_activated:
                if switch_wild:
                    sym = "W"
                else:
                    sym = "H5"
                for reel in range(len(self.board)):
                    for row in range(len(self.board[reel])):
                        if self.board[reel][row].name in switch_symbols:
                            self.board[reel][row] = self.create_symbol(sym)
                            changes.append({"reel": reel, "row": row, "symbol": sym})
                if changes:
                    switching_symbols_event(self, changes)
                            

            # Calculates wins on board.
            self.evaluate_lines_board()            

            # Add win info.
            self.win_manager.update_gametype_wins(self.gametype)

            if switch_dropped:
                if switch_spins == 0:
                    switch_wild = random.choice([True, False])
                new_switch_spins = random.choice([1,1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,3,3,3,3,3,4,4,5,6,7,8,9,10])
                available_symbols = [s for s in ["L1","L2","L3","L4","L5", "H1", "H2", "H3", "H4"] if s not in switch_symbols]
                num_to_add = random.choice([1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,3,3,4])
                if num_to_add > 0:
                    if num_to_add > len(available_symbols):
                        num_to_add = len(available_symbols)
                    new_symbols = random.sample(available_symbols, num_to_add)
                    switch_symbols.extend(new_symbols)
                new_switch_event(self, info={"spins": new_switch_spins, "wild": switch_wild, "switch_symbols": switch_symbols})
                switch_spins += new_switch_spins
                new_switch_spins_event(self, spins=switch_spins)
                switch_activated = True
            if switch_spins == 0:
                switch_activated = False
            # Check wincap condition and force freegame to end. 
            if (self.win_manager.basegame_wins + self.win_manager.freegame_wins) >= self.win_manager.max_allowed_win:
                    self.fs = self.tot_fs
                    switch_spins = 0
                    switch_activated = False
                    wincap_event(self)
            else:
                # Check for retrigger condition.
                if self.check_fs_condition():
                     self.update_super_fs_retrigger_amt()
        self.end_freespin()

    def upgrade_super_freespin(self):
        self.book.game_mode = 2
        switch_activated = False
        switch_spins = 0
        switch_symbols = []
        switch_wild = False
        prevent_switch = False
        self.tot_fs = 10
        self.fs = 0
        fs_trigger_event(self, basegame_trigger=True, freegame_trigger=False)
        # Sends an event with the selected mode for the freegame.
        selected_mode_event(self, mode="S")
        # Freegame loop. Stops once spins reaches allowed total.
        while self.fs < self.tot_fs or switch_spins > 0:
            # Updates freespin count and transmits event.
            if switch_activated:
                self.win_manager.reset_spin_win()
                switch_spins -= 1
                update_switch_spins_event(self, spins=switch_spins)
            else:
                self.update_freespin()
            switch_dropped = False
            changes = []
            num_to_add = 0
            # Draws board without emitting event since I will replace some symbols.
            self.draw_board(emit_event=False)

            if len(switch_symbols) == 9:
                prevent_switch = True
            # Replace "S" with "S2"
            for reel in range(len(self.board)):
                for row in range(len(self.board[reel])):
                    if self.board[reel][row].name == "S":
                        self.board[reel][row] = self.create_symbol("S2")
           
            # Switch Symbol Drop Logic
            if random.choice([0,1,1,1,1,1]) == 0 and not prevent_switch:
                switch_row = random.randint(0,5)
                switch_col = random.randint(0,4)
                self.board[switch_row][switch_col] = self.create_symbol("SW")
                switch_dropped = True

            self.get_special_symbols_on_board()
            # Reveal the inital board.
            reveal_event(self)

            if switch_activated:
                if switch_wild:
                    sym = "W"
                else:
                    sym = "H5"
                for reel in range(len(self.board)):
                    for row in range(len(self.board[reel])):
                        if self.board[reel][row].name in switch_symbols:
                            self.board[reel][row] = self.create_symbol(sym)
                            changes.append({"reel": reel, "row": row, "symbol": sym})
                if changes:
                    switching_symbols_event(self, changes)
                            

            # Calculates wins on board.
            self.evaluate_lines_board()            

            # Add win info.
            self.win_manager.update_gametype_wins(self.gametype)

            if switch_dropped:
                if switch_spins == 0:
                    switch_wild = random.choice([True, False])
                new_switch_spins = random.choice([1,1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,3,3,3,3,3,4,4,5,6,7,8,9,10])
                available_symbols = [s for s in ["L1","L2","L3","L4","L5", "H1", "H2", "H3", "H4"] if s not in switch_symbols]
                num_to_add = random.choice([1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,2,2,3,3,4])
                if num_to_add > 0:
                    if num_to_add > len(available_symbols):
                        num_to_add = len(available_symbols)
                    new_symbols = random.sample(available_symbols, num_to_add)
                    switch_symbols.extend(new_symbols)
                new_switch_event(self, info={"spins": new_switch_spins, "wild": switch_wild, "switch_symbols": switch_symbols})
                switch_spins += new_switch_spins
                new_switch_spins_event(self, spins=switch_spins)
                switch_activated = True
            if switch_spins == 0:
                switch_activated = False
            # Check wincap condition and force freegame to end. 
            if (self.win_manager.basegame_wins + self.win_manager.freegame_wins) >= self.win_manager.max_allowed_win:
                    self.fs = self.tot_fs
                    switch_spins = 0
                    switch_activated = False
                    wincap_event(self)
            else:
                # Check for retrigger condition.
                if self.check_fs_condition():
                     self.update_super_fs_retrigger_amt()
        #self.end_freespin()