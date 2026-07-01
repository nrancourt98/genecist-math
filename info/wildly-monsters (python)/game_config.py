"""Game-specific configuration file, inherits from src/config/config.py"""

import os
from src.config.config import Config
from src.config.distributions import Distribution
from src.config.betmode import BetMode


class GameConfig(Config):

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        super().__init__()
        self.game_id = "wildly-monsters"
        self.provider_number = 0
        self.working_name = "Wildly Monsters Shadows"
        self.wincap = 10000.0
        self.win_type = "lines"
        self.rtp = 0.9600
        self.construct_paths()

        # Game Dimensions
        self.num_reels = 6
        self.num_rows = [5] * self.num_reels
        # Board and Symbol Properties
        self.paytable = {
            (6, "W"): 50,
            #
            (6, "H5"): 40,
            (5, "H5"): 20,
            (4, "H5"): 10,
            (3, "H5"): 5,
            #
            (6, "H4"): 25,
            (5, "H4"): 12.5,
            (4, "H4"): 5,
            (3, "H4"): 2,
            #
            (6, "H3"): 20,
            (5, "H3"): 10,
            (4, "H3"): 4,
            (3, "H3"): 1.5,
            #
            (6, "H2"): 15,
            (5, "H2"): 7.5,
            (4, "H2"): 2.5,
            (3, "H2"): 1,
            #
            (6, "H1"): 15,
            (5, "H1"): 7.5,
            (4, "H1"): 2.5,
            (3, "H1"): 1,
            #
            (6, "L5"): 7.5,
            (5, "L5"): 3,
            (4, "L5"): 1,
            (3, "L5"): 0.3,
            #
            (6, "L4"): 5,
            (5, "L4"): 2,
            (4, "L4"): 0.6,
            (3, "L4"): 0.2,
            #
            (6, "L3"): 5,
            (5, "L3"): 2,
            (4, "L3"): 0.6,
            (3, "L3"): 0.2,
            #
            (6, "L2"): 2.5,
            (5, "L2"): 1,
            (4, "L2"): 0.3,
            (3, "L2"): 0.1,
            #
            (6, "L1"): 2.5,
            (5, "L1"): 1,
            (4, "L1"): 0.3,
            (3, "L1"): 0.1,
        }

        self.paylines = {
            1: [0, 0, 0, 0, 0, 0],
            2: [1, 1, 1, 1, 1, 1],
            3: [2, 2, 2, 2, 2, 2],
            4: [3, 3, 3, 3, 3, 3],
            5: [4, 4, 4, 4, 4, 4],
            6: [0, 1, 0, 1, 0, 1],
            7: [1, 0, 1, 0, 1, 0],
            8: [1, 2, 1, 2, 1, 2],
            9: [2, 1, 2, 1, 2, 1],
            10: [2, 3, 2, 3, 2, 3],
            11: [3, 2, 3, 2, 3, 2],
            12: [3, 4, 3, 4, 3, 4],
            13: [4, 3, 4, 3, 4, 3],
            14: [0, 1, 2, 2, 1, 0],
            15: [1, 2, 3, 3, 2, 1],
            16: [2, 1, 0, 0, 1, 2],
            17: [2, 3, 4, 4, 3, 2],
            18: [3, 2, 1, 1, 2, 3],
            19: [4, 3, 2, 2, 3, 4],
            20: [0, 1, 1, 1, 1, 0],
            21: [1, 0, 0, 0, 0, 1],
            22: [1, 2, 2, 2, 2, 1],
            23: [2, 1, 1, 1, 1, 2],
            24: [2, 3, 3, 3, 3, 2],
            25: [3, 2, 2, 2, 2, 3],
            26: [3, 4, 4, 4, 4, 3],
            27: [4, 3, 3, 3, 3, 4],
            28: [0, 0, 1, 1, 0, 0],
            29: [1, 1, 0, 0, 1, 1],
            30: [1, 1, 2, 2, 1, 1],
            31: [2, 2, 1, 1, 2, 2],
            32: [2, 2, 3, 3, 2, 2],
            33: [3, 3, 2, 2, 3, 3],
            34: [3, 3, 4, 4, 3, 3],
            35: [4, 4, 3, 3, 4, 4],
        } 


        # self.sim_ranges = [
        #     # low, high, max_sims, current_sims
        #     # FOR BASE MODES ONLY (Setup for sims on 10 Threads)(128800 sims For all ranges)
        #     [0, 0, 1000000, 0],
        # ]
        # self.sim_ranges = [
        #     # low, high, max_sims, current_sims
        #     # FOR BASE MODES ONLY (Setup for sims on 10 Threads)(130000 sims For all ranges)
        #     [0, 0, 0, 0],
        #     [1, 99, 2021, 0],
        #     [100, 199, 1701, 0],
        #     [200, 499, 1501, 0],
        #     [500, 999, 1501, 0],
        #     [1000, 1999, 1346, 0],
        #     [2000, 4999, 1201, 0],
        #     [5000, 9999, 1101, 0],
        #     [10000, 19999, 1001, 0],
        #     [20000, 49999, 801, 0],
        #     [50000, 99999, 501, 0],
        #     [100000, 199999, 201, 0],
        #     [200000, 499999, 100, 0],
        #     [500000, 999999, 50, 0],
        #     [1000000, 1000001, 5, 0],
        # ]
        # self.sim_ranges = [
        #     # low, high, max_sims, current_sims
        #     # FOR WILD MODES ONLY (Setup for sims on 10 Threads)(128700 sims For all ranges)
        #     [0, 0, 1000, 0],
        #     [1, 99, 1000, 0],
        #     [100, 199, 1000, 0],
        #     [200, 499, 1021, 0],
        #     [500, 999, 1500, 0],
        #     [1000, 1999, 2000, 0],
        #     [2000, 4999, 1500, 0],
        #     [5000, 9999, 1200, 0],
        #     [10000, 19999, 1000, 0],
        #     [20000, 49999, 800, 0],
        #     [50000, 99999, 500, 0],
        #     [100000, 199999, 200, 0],
        #     [200000, 499999, 100, 0],
        #     [500000, 999999, 50, 0],
        #     [1000000, 1499999, 10, 0],
        #     [1500000, 2499999, 5, 0],
        #     [2500000, 2500001, 5, 0],
        # ]
        # self.sim_ranges = [
        #     # low, high, max_sims, current_sims
        #     # FOR BONUS MODES ONLY (80000 sims For all ranges)
        #     [0, 0, 0, 0],
        #     [1, 99, 0, 0],
        #     [100, 199, 101, 0],
        #     [200, 499, 201, 0],
        #     [500, 999, 501, 0],
        #     [1000, 1999, 1001, 0],
        #     [2000, 4999, 1611, 0],
        #     [5000, 9999, 1301, 0],
        #     [10000, 19999, 1201, 0],
        #     [20000, 49999, 801, 0],
        #     [50000, 99999, 601, 0],
        #     [100000, 199999, 496, 0],
        #     [200000, 499999, 201, 0],
        #     [500000, 999999, 101, 0],
        #     [1000000, 1000001, 5, 0],
        # ]
        # self.sim_ranges = [
        #     # low, high, max_sims, current_sims
        #     # FOR SUPER MODES ONLY (80100 sims For all ranges)
        #     [0, 0, 0, 0],
        #     [1, 99, 0, 0],
        #     [100, 199, 100, 0],
        #     [200, 499, 200, 0],
        #     [500, 999, 500, 0],
        #     [1000, 1999, 800, 0],
        #     [2000, 4999, 1005, 0],
        #     [5000, 9999, 1611, 0],
        #     [10000, 19999, 1211, 0],
        #     [20000, 49999, 1001, 0],
        #     [50000, 99999, 801, 0],
        #     [100000, 199999, 500, 0],
        #     [200000, 499999, 200, 0],
        #     [500000, 999999, 100, 0],
        #     [1000000, 1000001, 5, 0],
        # ]
        # self.sim_ranges = [
        #     # low, high, max_sims, current_sims
        #     [2000, 4999, 50000, 0],
        #     [5000, 9999, 0, 0],
        # ]
        # self.sim_ranges = [
        #     [0, 0, 600, 0],
        #     [1, 99, 600, 0],
        # ]
        self.sim_ranges = [
            # low, high, max_sims, current_sims
            # FOR BONUS MODES ONLY (19000 sims For all ranges)
            [0, 0, 0, 0],
            [1, 99, 0, 0],
            [100, 199, 0, 0],
            [200, 499, 0, 0],
            [500, 999, 0, 0],
            [1000, 1999, 0, 0],
            [2000, 4999, 0, 0],
            [5000, 9999, 0, 0],
            [10000, 19999, 0, 0],
            [20000, 49999, 801, 0],
            [50000, 99999, 501, 0],
            [100000, 199999, 296, 0],
            [200000, 499999, 201, 0],
            [500000, 999999, 101, 0],
            [1000000, 1000001, 6, 0],
        ]

        self.include_padding = False
        self.special_symbols = {"wild": ["W"], "scatter": ["S"], "multiplier": ["W"], "scatter2": ["S2"], "switch": ["SW"]}

        self.freespin_triggers = {
            self.basegame_type: {3: 10, 4: 10, 5: 10, 6: 10},
            self.freegame_type: {3: 4, 4: 4, 5: 4, 6: 4},
        }
        self.anticipation_triggers = {
            self.basegame_type: min(self.freespin_triggers[self.basegame_type].keys()) - 1,
            self.freegame_type: min(self.freespin_triggers[self.freegame_type].keys()) - 1,
        }
        # Reels
        reels = {"BR0": "BR0.csv", "FR0": "FR0.csv", "WCAP": "FRWCAP.csv", "BR1": "BR1.csv", "FR1": "FR1.csv"}
        self.reels = {}
        for r, f in reels.items():
            self.reels[r] = self.read_reels_csv(os.path.join(self.reels_path, f))

        self.padding_reels[self.basegame_type] = self.reels["BR0"]
        self.padding_reels[self.freegame_type] = self.reels["FR0"]
        self.padding_symbol_values = {"W": {"multiplier": {2: 100, 3: 50, 4: 50, 5: 50, 10: 30, 20: 20, 50: 5}}}

        freegame_condition = {
            "reel_weights": {
                self.basegame_type: {"BR0": 1},
                self.freegame_type: {"FR0": 1},
            },
            "scatter_triggers": {3: 1},
            "mult_values": {
                self.basegame_type: {1: 1},
                self.freegame_type: {1:1},
            },
            "force_wincap": False,
            "force_freegame": True,
        }

        super_condition = {
            "reel_weights": {
                self.basegame_type: {"BR1": 1},
                self.freegame_type: {"FR1": 1},
            },
            "scatter_triggers": {3: 1},
            "mult_values": {
                self.basegame_type: {1: 1},
                self.freegame_type: {1:1},
            },
            "force_wincap": False,
            "force_freegame": True,
        }

        basegame_condition = {
            "reel_weights": {self.basegame_type: {"BR0": 1}, self.freegame_type: {"FR0": 1}},
            "mult_values": {self.basegame_type: {1: 1}, self.freegame_type: {1: 1}},
            "force_wincap": False,
            "force_freegame": False,
        }

        # Contains all game-logic simulation conditions
        self.bet_modes = [
            BetMode(
                name="base",
                cost=1.0,
                rtp=self.rtp,
                max_win=self.wincap,
                auto_close_disabled=False,
                is_feature=True,
                is_buybonus=False,
                distributions=[
                    Distribution(criteria="basegame", quota=1, conditions=basegame_condition,),
                ],
            ),
            BetMode(
                name="bonus",
                cost=100.0,
                rtp=self.rtp,
                max_win=self.wincap,
                auto_close_disabled=False,
                is_feature=False,
                is_buybonus=True,
                distributions=[
                    Distribution(criteria="freegame", quota=1, conditions=freegame_condition),
                ],
            ),
            BetMode(
                name="super",
                cost=300.0,
                rtp=self.rtp,
                max_win=self.wincap,
                auto_close_disabled=False,
                is_feature=False,
                is_buybonus=True,
                distributions=[
                    Distribution(criteria="freegame", quota=1, conditions=super_condition),
                ],
            ),
        ]
