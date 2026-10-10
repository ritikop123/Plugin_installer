import React, { useState, useEffect, useCallback } from 'react';
import { ServerContext } from '@/state/server';
import http, { httpErrorToHuman } from '@/api/http';
import ServerContentBlock from '@/components/elements/ServerContentBlock';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCubes,
  faSearch,
  faFolderOpen,
  faSpinner,
  faDownload,
  faCheck,
  faTrash,
  faTimes,
  faExclamationTriangle,
  faLayerGroup,
} from '@fortawesome/free-solid-svg-icons';

interface ModSearchHit {
  project_id: string;
  id?: string;
  slug: string;
  author: string;
  title: string;
  description: string;
  categories: string[];
  versions: string[];
  downloads: number;
  follows: number;
  icon_url: string | null;
}

interface ModVersionFile {
  url: string;
  filename: string;
  primary?: boolean;
  size: number;
}

interface ModVersion {
  id: string;
  name: string;
  version_number: string;
  game_versions: string[];
  version_type: 'release' | 'beta' | 'alpha';
  loaders: string[];
  date_published?: string;
  files: ModVersionFile[];
}

interface GameVersionTag {
  version: string;
  version_type: string;
}

interface PteroFileItem {
  name: string;
  size: number;
  isFile: boolean;
  modifiedAt: string;
}

const COMMON_LOADERS = [
  { label: 'All Loaders', value: 'all' },
  { label: 'Fabric', value: 'fabric' },
  { label: 'Forge', value: 'forge' },
  { label: 'NeoForge', value: 'neoforge' },
  { label: 'Quilt', value: 'quilt' },
];

const COMMON_VERSIONS = [
  { label: 'All MC Versions', value: 'all' },
  { label: '1.21.4', value: '1.21.4' },
  { label: '1.21.1', value: '1.21.1' },
  { label: '1.20.4', value: '1.20.4' },
  { label: '1.20.1', value: '1.20.1' },
  { label: '1.19.4', value: '1.19.4' },
  { label: '1.18.2', value: '1.18.2' },
  { label: '1.16.5', value: '1.16.5' },
  { label: '1.12.2', value: '1.12.2' },
];

const MODRINTH_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAABw0SURBVHhe7V0JlGRVeW7cEheixmjUKLhHJZtBhRBiO3S9e19PN4MCg4JsDjDQVXd51TM9M4CmwRiDETkSF8QguBBRETjiAghIBAEHZu2qt1f1bMwuMGwiylg5332vmppbb6vpnqE1fuf858yZrnvffXf59/u/vr5ZChKOvt70xAD1eIX4/HPE5dcRm91LHGYbDt9IHLbNcNiDIGLz7cRhG4jL68ThPyeeuJZ68mLqy7NLAe8vbRh7rd7/H6HB8NgbzcD6CPHFf1NfrqIef3xw/WhraOtYa3jrktbQ5rHW3I2LWvg/c7LaMptWy2zE1LRag5NV9Tf8Br9VbbaMqf8nHn+U+nIF9cWXBkP5oSG/+lf68/9fwgz4m82mVTUDcQf1xJOYMEw4JpIGskVc0SIOnx65okVD2RrcMBov5OIW9cVjNJQ/GWxY5+Ck6eP6g0b/Hf3PGwzlB2hD3kh9+eTwtiWtuZsWRxOuT94+IjwLz8SC0EA+ZjbkdwYbclAf6x8U+uvll9DQqtBQ2nMfWKzYxP6c9DTCGHDywLrMhrXCbMoF76zPf4E+/t9bvPO7819gBqJMG3ISux3sRZ+EWUEuj+TH1rEWbVo2CcRH+/r6DtDf5/cKNJTzaCgn1MSv2wcT78ak//80qS0vaMO6l/qspL/XrEepLg4CXwWfxa7SX7AwuaJlhpY6NRCeQ1uXTGk3Qw8sVnwchH/j/9TftkZ/U9pSOD1Bjr6VQtCwrjBX8Vfq7zkrYbjsdLNp7cSu35uXh1qJCcRkKhXS5Q8bNltLPHEdcfilhi2WEIedZTjiw8StHEdqleNKdXYiccVC4rBlhs0/Tzz+fcNhsAkew8lDX5hMLKb+vDyinmgNb18K1XcDsdkH9PedNei/o/wSM5RXTunedvfLpBEmRgnCBxa3iC92Ul/eaLhszHR4v7HmnFfpzyoK6livMTx2FPHEMuKLm4krdkH496wA2DyyMTYtgkp7Sf94//P0Zz2rKNVG3mE2rNXDO5b2tOvxUjgp1Be7qC++TRvy2AGn8gq9/5nC3Hr51bQhTzRD6zriiyci2VTtGlci2RzjbB29Y2lrsGH9L7lvZHbYD0aNE3PSehC7quiun7thVO14GloODeVoya3sd1cBXSffMBha59HQakC29KIkDG8dg/W90VhTPkzvd7+iVCufYk5Wn1aqZd7k4xhPVpUgpaG1lobWKfPr48+6vm2sOfnFJJAjNLQCnAjIoCLvotwik9bjAxNsSO9zv4DU+IgyXpo5A8bRhSBTLye3wCbov2N8dvHQvr6+4RULX0QCuZQ2rIewSXJZKTbUOuWXero0UT5B72+fomRXzoFaqLSKnMlXwmsDhJd1xVET4i/1vmYbjDXsjbRhfRssNVeZsLlyDA5OVn9nTLD5el/7BKTGTo1UOpk9OIfHVqV8gHr8GL2f2Q7q8VPMZgHZFrNWnISBNWVT72dGYdRGiDlZ3Z3HdiLdeUmLBOLm0sqZEbBmwP+EuvINZsAPJ44YJq44Ce4CwxGnzXMXHKj/fiZQWnX2W82mdTfsgEyLu82OmtbjdG3lH/V+ZgRkgr2dNqxHMgUu+H0glZZAfXmJ3kcvMAP+Z9S3SjS0LqS+vIl4fB1xxK8hJCOf/+LW0b9c1iIO++3QxMjL9fYzBfiySCCuitXl7nfuePfYTtgEdVfvZ1qAJ5N4woaFmjX57ckhHrf0PgphfPw5NJSUNuXXiC+2QHYodzVcC5NVtbg4Xe3diL8Tm9+vd6PDsNnVc9cv+pwZ8HfpfysK4ol/U6pzlgFnM2V1E5f/bLw1/hy9j70GXgAGSN7kq9NRr8CL2BOMW05+sRlUy1BPsYB4CcXmso49ZMyWMfzmW3p/nTj8nuoLEbact+s8TN7vzMC6eW99/4bNxopY0ZgrY4J9Rm+/VzDq7PRoVdOPHyJOmLjSXky+GVTPMJsyVFYpdnTOpHeS8jfV2bjeZydIvfwW4vDfUj86PWBdKgAUytupW3m//vs8qEXAScBJTBiTmg9fRPNRq1C9fU8gtZHX01A+otSxhAeph+GltozhYT2xnYHayHvMhrxTOd32MkYQsUT2Ib3vThCnYsxF/50L63LlD1KCsyG+0r9i4V/o7bJgOOyTmYIZQlltJrGp1Fz4Ur19YRh19gO1+9NYD3YhBmKzz+ptswDnmNm0fovdqPdXlLDwsbv5UL3/ThgOryjDSu8j9u0oT2ezus6wWU9siTj8m9G7d4+t3T/+btTZZXrbQqA2P0bpwGmspy1wHH6z3jYN/atPexkNrBvUSxewI7rIbU+8pdiIYbOn8vz01Oafj8eZTNBeNoxGp9Dn5+vt0wA3CvHF/Vl2AtgenH2ltfxwvX0moHMbDmsoLSOhY3XE1IDFlrwJaGPgvpE3qegYdo3eXwbhJdqCWfHuiPfuMierm4nLbulrZYcNic1uUW7uhL6nqK0+71iK513ZN95XSIOZU+NvhmpuNlNYtA02OYZTcI/eNhMluyKzJgqToNTNgpZfaSXc1XKj0lpSdotOylWNneuJpwxH3G244iLqs2MH3MrfwqVx/MbqC+d/d/5z9Wd1ArsUGpDapQnP6CJXtI7euQys6YZDVyx8vt5fEgZq7NRYG+vuT/UJbU0pMcfpbRNxhLvgQOLwbamCt83bapWv6G2TMOd+tUs2xQKzuz+NcOpU7k4ga2ZoLSZh9S16n0WBk0wc/mmzYW0r7OmEGolFcPkNfa1W5ulqw7DZ97NkJTarUWf1QraB4bCqciMkdARSC+OLrf3r5Mv0tjoGlldeYQbCy+KTimBHhFYUnGlYaxE0Qf6Q3t/eAlqOGcrzzVA+mKdStwmLYNTZV/W+koAYOA2RX5Qe8sQpMVx+vN52D0RHlq/PCk7gBQybnaG37UKr7wDisNvUYuZMvnLuNawnzcBaBtNf72qmEKvVV+M05vmzsEjRSS+P6f0kwaiVP5bFtpXSUKss19vtgZLNT1D8LKED1Qn4fp3Vxsfzj1KpVv7U0Tvgq+nup5MUawitNaa9926CXkF8earZtB5T75PBFlVK42S1Zawtv0/vQ8fw5oUvgt6funldoeSaUWP/rLedgmGznyperTeOCawk9xipfsrvU+kcfobJ7kKWqNTA6+Fr0vvY1xiw+bvMhrUuYo8pixBHvqgrJouMkdQrXFnnej8x4W+Gzb+ut1MYcCpvI754Om3SkKxk2MyBw0xv2wmlwtrMg2cw64jjuFIvZTB7iXk7xw7sX3fan+r/n4Y5KxccTEPp5y0C1NNSjf2X3l6HsWbRi4nDt6YpMLGM2EXq1T/X2/YRm58/vC2dh6mVtfmI3k4HcfhSlR2R0IcivBD68sS1etue0Oo7AIF12rCGaCgvoJ78kdm0thKP34NNoP88DXPs8sHQ0iJ2lDDeOH/UbFi7SY39vd5eB94/i43DKjfq4jS9HdjPfWlZbNHKsYfz/O5mwF9JPbFLCbiEfpRhgt3my/t6TYA95uHxl5GQH0F9KagnriausA1X/FoZaduWKL8Qngu5Yzjsar19FsjEyKFms/pkqhaDTbNVGVQ/0tvqIB43acN6Os1ZF2uEP9yzUb36FuKB/SQ3inRc9rU9GiXAqPN/z/KPYIJoaD2CuKveNg39y8uvNpvWTbRh7YDFqdIPkfw1dYdAe05be5monKv3lYVSrXJmlkGFCVVC1JZ7pKLgsgdpVo+jrvgS9cUE8fhTets95iC0wMof7fdGn3EAItUv1V8SZw1jZTsfrKO0YuFLicN3pprlcT4NmeAL9LZpOHLVR19JA2stIl9qdxbQ30GQY8qt4PbmDiY2uxFx7LQNpJQQh99Qcng/9eUFxBN34rLHVCqlUjzyxwjXCHUr8zoffE0a34r0ZbYdAmaP0WooOfzMLA0AgzRsdpfeLg1H3jXychrIFVkWZiIpdqG0qxWIIev9ZkFlRATyV8pRqPcbExa3fRKVhpQTnEmiSJ5WopAtLE7isCBNf401hFyBicmFsaG3B6nji/5dfoTeLgk4TTQQv4gFf1d/qRQLeBrI+8k9Z3RrGgVg1CoXZ22ktke26/97oEjWxpuxZIu3Gg5PVT/jHZip/ZjwCnpCRZ309iDs/lKtcrveLgkqU82Xd2XJkkSKd77ZkCtIfe8mH4BbAQ7AtHeZCQI7NWz2oArWGC4/Wq1IgvBpBz2oY2WmWlBbnJMpQyJHXG5q9+H3HP9C6ouf5rovdIJRt21piwbW6l6jW0kw6uwnWQbpdKkd0yhNVN7dRxyxLG3yopWq7ICHVB9kJ4jDrk1z+Q5CKNt8M4LjertOzK/PfwHxxC1Z/pQ9CKb9ZMSLY56/vGhsIg+kXlmYNidFSAVi2lpaykZS81UvfwSGw1VRIEJ0URQyZL/QB9gJ+M2JzZpp1p9y3jnsSr1dJ5Qc8sQPMw24NsXBIESaqCca6u7vOjl46OXF/PdFMNcuHwx1sqiAVTsaice4uROpsk8Th60ybP5QGitT8+LyC/pInd2WdtwizYh9Qx9gJ4Z8603trAO9vepj81hroF45SW/XRqm59KXE5dcX2vkw5LAzfbHSDHj/vsyuJjZbkRoRjAnulkjuWBjTOuLxa8xAnDHYHH2b6sPlP8ycW9hWuKE+vHn07cRjXTS889y3w7rVB9cJlXWwQcs6iEnpxC7fjb70dm1ANsx76Nyutl1ksyjXNLTWwj7Q+5lplGz2hVQ2BHtEGa7yJ7Qhx+b68jBE6PQ+DJt/RdkVevvYFlAh1ekCsYF0G6IK831L0uDagHvDcJiycvX2nQRnIO4YwzLW+9gXIA47NU2uxazpN3nXp8Bi0hYRp8uw+Uq9Tc9QTryMhxRKHazzy7J0b2gMNBA7ZyrRtwhKrvVu9dwEnb+txZA6e6/erhPKPZ0yN+pqlM19vU3PMGx+cdpDcMwMOz9tpeTwwyNDrftl1Qtjx/niiV4t2yQYjUWvMjcu+nDeYpoBf51hsycTBfFUcIUTvV0nkFWYdoqgHRo226i36RnEZl9I43NKi7LZ9XqbLrT6DjDqbG2W0Ivi1NlpiGkoNcVBZiAX0EDcQHzx0Aee+DjG9Sn9d52A7DMc9nDi1dbYP2bU+NF6u06QeuWkNCEMF49h8y16m56RtwCGza/T2ySBuHxxFhuKPJHMycsD6oTpibIZyluJJ55QKuLmsejid6Qyb8+KcsGmMBz+UNYC4J6C3q4TJYedmL0AbEYW4LOZLMhhN+ltkoCcetzjTXWExce+tPacQllmxOVfnPfwecoNksRGlM/IFufo7dow1yoW9Kuktu2xEEcYertO4PJIGgtSCorDp8+CqMM+nroAStKz+/Q2iRjvew7x+EqVSJvQFwgJr2YgVyLFUW/eCWLzT0Qhz2SZovqKTtQ6XM7T2wPULh+CiU7qQwlh5SXYMzaggziMpc0NhLBhsxCr9Blz0rrScHgXDW0Zu5La2cUqEEvIVENt9kD/uvHMOK3hyUFc9E487p3UDmcG4s401ZY43MJ40gzDdj/xmO9Lc7OTOjeVTEq0byRY69NIfdfbdQIyK3UBYDvZbDV2y+ZjHjk/KnKh0bFPjeOYXKx33AnkwGcO1OVPw+OqtwMGJkbeNNiQV6N9Wjg0idTudsVNuO66sLXw+YYvD0MWHQ3Ej7EzE9lGm1QyLk6S2HJURukyw+GjaZMXhy63z3PHMn1khs0uT5OPkeue3YYdc1uaHz/eJd/UO+4EUgez3NkqVuvJPa5wwm9DfTlmhtYuxYsTjnkeKS3EYasQy8CEYLJUpAl9pTjAQPitOVn9zcBE5Z86x6TDsNl30/h3YfvGZjenCeGpuY1ZTdcP1IOixKV79Y47obLp6mx9jjPu8vbvEdocbFqroFYWzdVMow6nXNffkgi/w6Tm3eRBaotRZ5uVJzehn+ideKaDEXmghsO9tEBX1If4JBbg3KyjZthsR941UMRJ03ZLtDAsMBzxN9QTX++V3cwkxfk9uZdJSrYYSGOroOjCBztLb9cJaFEkzZCbii+L0/pKrpynkqgSHjZlcrsjmbdQskxuRTb/neHyp/DQorsV4+lld2dSW3i7/Mf62JMAL2XirZq2g9Hju6kr/1pv14lSjR2LZILE8WNelR0gD4susbkZ7uSIhZT1B3Ri0Bl9G/HE7rQ+VBw1ZSd0UXzzPE6U8tEu8SWKEoQuZIMvg/7V+RndqqSNLx5L08hiJ9qaPIMQmt3cjaO2ChrhAmJUfEr1EZV4YFGGHAIqhsPCNF4VsZb8oDyps1+kCfNC1L6zFaWobzXq7Ow4v/8/1RXZhBNahLCQSMSdY5cP0cecBMNmF2VmCEZxi3/V2yVi/vzn0qb1L7RRvYQGMsTigVOowFOnbDUc/j9pgjhO485NSzFsdrKS+Hs5UWirhF4oL9Ndzsh0KxQtA7lx2bPY9TC4fvTBUr0jBycDKOJKA/l42u5XJ9yXqWp1FtRmCoRBQuvLQ1vGthGHf27qj6Qu0mOg8HtsWtQq2eW5e/SogTrsWBpau8HfuvpIo5jdxLv+LtMTR+r9AriKNBUvTtKa4vgw2KWSZ4HYQn1xNcoUH3XvGYUrtJA6u17NQ9IzYtXRqGtphXsBxECGOzPjUEKYehlyYAsSSpNDk6UVCw8ym9ZVygAqOvlTV0QjdkODdJ9MG6rwqy9XxKE89az2PbI4I23S8OTlpDk6jDCn3j4PynWclZroRvfi9uZydyGQOluRph7GR3IXrhy1f49daQbSUtd+ejSmMPlmw3qYNqwv9vdQ2AK/pQ3ZOGbXee04bB1FQQYb1lF57o4sGKvL/2A2q0+kJhW31cY6u0NvO2Mo2ey8LHdwnKWmErTgH6IN6z78X+5VnwSKhLW4UR9DEdDV5UPmPrB4nDSr7827q1AEKL5HA7kh1rq6xgrChoGSkud8mxZwQYNmqJKxQWUTh1+h1MTpaDzQ8aPyAZ/Wx7E/0b/2zNfRhrTj9MvucYLiCxpGrdiFvWmhZFdux8XirkGogbBIu2j7W/S/90joI/ZsfvnZqNF81MTI39GG1Ygmv3t8iuJb9LiQnnirRYPhiA8ObV58lrF1UWawPhXU5icM41KxPpBeKdZu1KlJ21kglcuPS3ry1lJ94UH6ePYVUG3LnLR2qVOcMT5wA8WaClxIh5puOGIHgkA0EA/SUF4z2KweV+Q67xTi+13r0oyyXFLajYx2tsOa8AHFDr3u33YQtA+zaW3H7UV9TDMJev9Zr0H1K1jGyGRL3fkgN677UytfqPeTBKPOPt5OLoPSouwQ2EVKJZZX4irV0IbsG0YK6qJ2hjDOIrAv5e5tyC+oCxu4l9uwdmQJOEXtmqIqZitvJSGfo49rOoAzkXh8qRnI7UU1NnXVyeXf1vtKgrqoDQMu4YoTlBTEBJB8Bhalt+0C/CXEE7/MS5SaorYxFZV7/5l+BwDVZc1m9bHYh97dvpNQV+GZ8mS3kUCcNLRhWf6uyQEmCFZ2oTHEXlPiiVuRMKz3lYSSzW7MMuBi/5Fb+PKgYbMLI39Fd2c6xbt2C/Flqnu2NDHSb05ajxZhRyDsUFWWHjUjXAHW9B0Ya6iYCGdZf6v3wq+4EFFEc1N+p0DcmhYr1oEynlkGHEj5/u0e6opCcBBX7EgLsrQJsoIG8vIiOfnxSdgcWbLdfaWR0rxQ8RxyAvEJhz2CbGzishWGze4enLTuLdXZ9bneSZt9LIu1QtfH5FNfXGv+uNhOjcrVyEdTuYUqV7MYBlxmUCsRyj+UUbQDFFnOlSv0tmlAzSAzlMtVOnwBPqxTFJ+IygdAPcTzlcMNRZFqI+/Qn9cJpBFiouBS2KPfuOZn5LIWF+nt0qAKNnliRZYaq+4JrBtt5YU/U4GPouXtWOwqo8YKaQoAdhcN5RfhNCvKk/MIR7xUZ0x/VifAz4063yN02rZFUM6mSAmGTkQly9L5Pv4/NuCmwrE9Q30XILTSLzDHq6yOWa1ABZUOUFfOM1GxHOXLphkbVlWpXP4D/Rk6VKQrdrtDHsSFVq9B+FD/bRaMOor2qQhb11gUqaJ9oxDkm4oEgTIxMFFZGIfzuh8UEyYQR63XKuL46gb1xYWoWK4WIsMZlkVx7PqhPC8oKiwe8+j5kTwJ5XLTF5ku9iQQu7IY7bPuA+NvWFxjbW+FAFNh1Pi3MrUiFFxqqs8L7i7ZvS0CENkL8j9oKLcqn35KOmEqFb1MDn29Ub2F+vJE/W9FQGy+WMW1c8YGYV4k+F8YyhcfCEdZdjmLEH0SJDtjIA34fAkNrTNpIG6nfvxpw46yBFmCW53SOr9U73OmQFz+CbXzsyb/mUqSd+XVs+sZpZp8B21ajyg3RdYixA471FrW++gFxnrU8ZenE198g/gcX1FSJcHUV/jiT1Zh0hVtXdJCaWLk2xcttlcUqOBFQ3mlsqAz2A7eXQVsQvkAPh6k9zMjGKiXTXysIE9oTkW7UIzpjnwboQjmbRh77dxJeZhR58cjLkHqbBnKFiP/Un1xKRBnIGw6kwuAjBGzgfL12TKwrcoiqDOwauQ9ej8zCmNt+fSpDzjoA9FI7ZqGbOalcc9GGJ442WwU+4CDkn+T1u7SRHbcfMZQmmCs6CdMoOtDLpihuPTInHpDswF09dlvgGqqDLw8j6ma/EgDJLWRzBrWMw4YPnG1w9xBTuX7hHI9CYqXq9mfgO+HNqpj2PVKkOoWs07PfMQHlbT27+S3YdTLp2MAKryYtQgdA458OnK5GVjH5/lv9gfUxPvybNSOi63iQu8SJXxVnzBqI5n3xPY5UHXcbFYfji7kJQw2gZQPB7p+KFepe1w5l8H3BVCOgIbyXBrKRvsr3vo40wiFpwab1qa99vHMNOasLh+CircqIpR3dNsE4wllinH7PRA7EalC1AjfjtH7nymomnahdQL15feoLx7Hji/8KcO27wiOxNC6a87d5YP1/p9VHPHzBQeSQH5D7aY84aWRsh3ir1ojAE49cS3xBSM+e+8xvcRUNaDINz4ISj2xhHjyR9TjD+LkFbFm96D299Ag8wJx6aGXHzpjqu6Mg7h8Ab6/FfmPCp6GNiGvEyE8+P/xvcaoWuMOw+HLic2voS67yHCZoDY/xXAqH6QOG4o/aXUcvl1Tctki4vJLiMuvMxy+Bslk7WiduqmTkvOZRWrXb1+qWA7SL/X3nZWIvkZXvRZWa1q2XRFS/n9Yv6qiemz9YjLVd2Ciix6KVPSs8+8RT4/uNvS4CToI/cKraYbiql5yTGcNUO/fbFq1XnltIYJl2kn636dB7ZxTs2EtN5zscgSzHioA40uBOs1qIXrQNvYrdSgFZsNyzaaEvTLt1MdZA1zppA0paChdxeMhCFPSIPcnQRgrBSD6tNUqeGOLxoR/L6FKnDWrx5kN6wc0EE/hVCgvYi9ayTQJz8KEq1SaQCCf53tmowo/zrNuGO5XDDXEWwfD6iIzkHcST/xa+f9jo0gtyEzwdpQbCKQSpm0BTj3xOPKOaGhVhptiv6VEzmqg9pzpW6dRX3yV+HItcfmvsBBYkCnNB1+xjty+cQbeM6RyUZHdEGdKqDbtj8T54lHiiZXEl5eZDfFh1ALSn/9HaFA1fjwxAFcF8cSlKOyHi23E5Q6qjOD+MqoS4itJKBtAHLaBuCp9/ucojU988Vkkc9FQvp+u30cBkhnA/wEFS9D3dXOOPwAAAABJRU5ErkJggg==';

const SORT_OPTIONS = [
  { label: 'Most Downloads', value: 'downloads' },
  { label: 'Relevance', value: 'relevance' },
  { label: 'Recently Updated', value: 'updated' },
  { label: 'Newest', value: 'newest' },
];

export default function ModInstallerContainer() {
  const uuid = ServerContext.useStoreState((state) => state.server.data!.uuid);

  // Tabs: 'browse' | 'installed'
  const [activeTab, setActiveTab] = useState<'browse' | 'installed'>('browse');

  // Provider State: 'modrinth' | 'curseforge'
  const [selectedProvider, setSelectedProvider] = useState<'modrinth' | 'curseforge'>('modrinth');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [selectedLoader, setSelectedLoader] = useState<string>('all');
  const [selectedVersion, setSelectedVersion] = useState<string>('all');
  const [availableGameVersions, setAvailableGameVersions] = useState<string[]>([]);
  const [selectedSort, setSelectedSort] = useState<string>('downloads');
  const [page, setPage] = useState<number>(1);
  const pageSize = 21;

  // Catalog Data State
  const [mods, setMods] = useState<ModSearchHit[]>([]);
  const [totalHits, setTotalHits] = useState<number>(0);
  const [loadingMods, setLoadingMods] = useState<boolean>(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Installed Mods State
  const [installedFiles, setInstalledFiles] = useState<PteroFileItem[]>([]);
  const [loadingInstalled, setLoadingInstalled] = useState<boolean>(false);
  const [uninstallingFile, setUninstallingFile] = useState<string | null>(null);

  // Modal State
  const [installModalOpen, setInstallModalOpen] = useState<boolean>(false);
  const [activeMod, setActiveMod] = useState<ModSearchHit | null>(null);
  const [versions, setVersions] = useState<ModVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState<boolean>(false);
  const [versionError, setVersionError] = useState<string | null>(null);

  // Modal Filters
  const [modalLoader, setModalLoader] = useState<string>('all');
  const [modalGameVersion, setModalGameVersion] = useState<string>('all');
  const [modalType, setModalType] = useState<'all' | 'release' | 'beta' | 'alpha'>('all');

  // Single Mod Install State
  const [installingVersionId, setInstallingVersionId] = useState<string | null>(null);
  const [installedVersions, setInstalledVersions] = useState<Record<string, boolean>>({});
  const [installNotice, setInstallNotice] = useState<{ success: boolean; message: string } | null>(null);

  // Helpers
  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatSize = (bytes?: number): string => {
    if (!bytes) return '0.00 MB';
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(2)} KB`;
  };

  const formatTimeAgo = (dateString?: string): string => {
    if (!dateString) return 'recently';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return 'just now';
    const min = Math.floor(diff / 60);
    if (min < 60) return `${min}m ago`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  };

  // Fetch dynamic game version tags from backend
  useEffect(() => {
    let isMounted = true;
    http.get<GameVersionTag[]>(`/api/client/servers/${uuid}/mods/tags`)
      .then((res) => {
        if (isMounted && Array.isArray(res.data) && res.data.length > 0) {
          const list = res.data.map((item) => item.version).slice(0, 30);
          setAvailableGameVersions(list);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [uuid]);

  // Fetch installed mods from /mods directory
  const fetchInstalledMods = useCallback(() => {
    setLoadingInstalled(true);

    const parseFiles = (rawItems: any[]): PteroFileItem[] => {
      return rawItems
        .map((item: any) => {
          const attr = item.attributes || item;
          return {
            name: String(attr.name || ''),
            size: Number(attr.size || 0),
            isFile: attr.is_file ?? attr.isFile ?? !attr.directory ?? true,
            modifiedAt: String(attr.modified_at || attr.modifiedAt || ''),
          };
        })
        .filter((f) => f.isFile && /\.(jar|zip)$/i.test(f.name));
    };

    http.get<Array<{ name: string; size: number; modified_at?: string }>>(
      `/api/client/servers/${uuid}/mods/installed`
    )
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        if (list.length > 0) {
          setInstalledFiles(
            list.map((item) => ({
              name: item.name,
              size: item.size || 0,
              isFile: true,
              modifiedAt: item.modified_at || '',
            }))
          );
          setLoadingInstalled(false);
        } else {
          http.get(`/api/client/servers/${uuid}/files/list`, {
            params: { directory: '/mods' },
          })
            .then((fileRes) => {
              const raw = Array.isArray(fileRes.data)
                ? fileRes.data
                : Array.isArray((fileRes.data as any)?.data)
                ? (fileRes.data as any).data
                : [];
              setInstalledFiles(parseFiles(raw));
            })
            .catch(() => setInstalledFiles([]))
            .finally(() => setLoadingInstalled(false));
        }
      })
      .catch(() => {
        http.get(`/api/client/servers/${uuid}/files/list`, {
          params: { directory: '/mods' },
        })
          .then((fileRes) => {
            const raw = Array.isArray(fileRes.data)
              ? fileRes.data
              : Array.isArray((fileRes.data as any)?.data)
              ? (fileRes.data as any).data
              : [];
            setInstalledFiles(parseFiles(raw));
          })
          .catch(() => setInstalledFiles([]))
          .finally(() => setLoadingInstalled(false));
      });
  }, [uuid]);

  useEffect(() => {
    fetchInstalledMods();
  }, [fetchInstalledMods]);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch mods catalog
  const fetchMods = useCallback(async () => {
    setLoadingMods(true);
    setCatalogError(null);

    try {
      const res = await http.get(`/api/client/servers/${uuid}/mods`, {
        params: {
          provider: selectedProvider,
          query: debouncedQuery,
          loader: selectedLoader,
          game_version: selectedVersion,
          sort_by: selectedSort,
          page,
          limit: pageSize,
        },
      });

      const data = res.data;
      if (data && Array.isArray(data.hits)) {
        setMods(data.hits);
        setTotalHits(data.total_hits || 0);
      } else if (Array.isArray(data)) {
        setMods(data);
        setTotalHits(data.length);
      } else {
        setMods([]);
        setTotalHits(0);
      }
    } catch (err: unknown) {
      setCatalogError(httpErrorToHuman(err) || `Failed to load mods from ${selectedProvider === 'curseforge' ? 'CurseForge' : 'Modrinth'}.`);
      setMods([]);
      setTotalHits(0);
    } finally {
      setLoadingMods(false);
    }
  }, [uuid, selectedProvider, debouncedQuery, selectedLoader, selectedVersion, selectedSort, page]);

  useEffect(() => {
    if (activeTab === 'browse') {
      fetchMods();
    }
  }, [activeTab, fetchMods]);

  // Open Install / Version Selection Modal
  const openInstallModal = async (mod: ModSearchHit) => {
    setActiveMod(mod);
    setInstallModalOpen(true);
    setLoadingVersions(true);
    setVersionError(null);
    setVersions([]);
    setInstallNotice(null);

    // Default filters based on page selection
    setModalLoader(selectedLoader !== 'all' ? selectedLoader : 'all');
    setModalGameVersion(selectedVersion !== 'all' ? selectedVersion : 'all');
    setModalType('all');

    const modId = mod.project_id || mod.id || mod.slug;
    const provider = (mod as any).provider || selectedProvider;

    try {
      const res = await http.get<ModVersion[]>(`/api/client/servers/${uuid}/mods/versions`, {
        params: { mod: modId, provider },
      });

      if (Array.isArray(res.data)) {
        setVersions(res.data);
      } else {
        setVersions([]);
      }
    } catch (err: unknown) {
      setVersionError(httpErrorToHuman(err) || 'Failed to fetch versions for this mod.');
      setVersions([]);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Single version install
  const handleInstallVersion = async (ver: ModVersion) => {
    if (!activeMod) return;

    const file = ver.files?.find((f) => f.primary) || ver.files?.[0];
    if (!file || !file.url) {
      setInstallNotice({ success: false, message: 'No valid download file found for this version.' });
      return;
    }

    setInstallingVersionId(ver.id);
    setInstallNotice(null);

    try {
      const res = await http.post<{ success: boolean; message?: string }>(
        `/api/client/servers/${uuid}/mods/install`,
        {
          url: file.url,
          filename: file.filename,
        }
      );

      setInstalledVersions((prev) => ({ ...prev, [ver.id]: true }));
      setInstallNotice({
        success: true,
        message: res.data.message || `Mod ${file.filename} was installed successfully!`,
      });
      fetchInstalledMods();
    } catch (err: unknown) {
      setInstallNotice({
        success: false,
        message: httpErrorToHuman(err) || 'Failed to install mod file to server.',
      });
    } finally {
      setInstallingVersionId(null);
    }
  };

  // Uninstall a mod file
  const handleUninstallFile = async (filename: string) => {
    if (!confirm(`Are you sure you want to delete ${filename} from /mods?`)) {
      return;
    }

    setUninstallingFile(filename);

    try {
      await http.post(`/api/client/servers/${uuid}/mods/delete`, { filename });
      setInstalledFiles((prev) => prev.filter((f) => f.name !== filename));
    } catch (err: unknown) {
      alert(httpErrorToHuman(err) || `Failed to delete ${filename}.`);
    } finally {
      setUninstallingFile(null);
    }
  };

  // Check if a mod hit matches an installed file on server
  const getInstalledFile = (mod: ModSearchHit): PteroFileItem | undefined => {
    const titleClean = mod.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    const slugClean = (mod.slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return installedFiles.find((f) => {
      const fn = f.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return (
        (titleClean.length >= 3 && fn.includes(titleClean)) ||
        (slugClean.length >= 3 && fn.includes(slugClean))
      );
    });
  };

  // Modal filtered versions
  const filteredVersions = versions.filter((v) => {
    if (modalType !== 'all' && v.version_type !== modalType) return false;
    if (modalLoader !== 'all' && !v.loaders?.includes(modalLoader)) return false;
    if (modalGameVersion !== 'all' && !v.game_versions?.includes(modalGameVersion)) return false;
    return true;
  });

  const availableModalLoaders = Array.from(new Set(versions.flatMap((v) => v.loaders || []))).sort();
  const availableModalVersions = Array.from(new Set(versions.flatMap((v) => v.game_versions || []))).sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true })
  );

  return (
    <ServerContentBlock title={'Minecraft Mods Installer'}>
      <div className={'my-6'}>
        {/* Header Section */}
        <div className={'flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6'}>
          <div>
            <h1 className={'text-2xl font-bold text-neutral-100 flex items-center gap-3'}>
              <FontAwesomeIcon icon={faCubes} className={'text-cyan-400 text-2xl'} />
              Minecraft Mods Installer
            </h1>
            <p className={'text-sm text-neutral-400 mt-1'}>
              Discover and install Forge, Fabric, NeoForge, and Quilt mods from Modrinth and CurseForge directly into your server.
            </p>
          </div>

          {/* Tab Navigation */}
          <div className={'flex items-center gap-2 bg-neutral-800/80 p-1.5 rounded-xl border border-neutral-700/60'}>
            <button
              onClick={() => setActiveTab('browse')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'browse'
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <FontAwesomeIcon icon={faCubes} />
              Browse Mods
            </button>
            <button
              onClick={() => {
                setActiveTab('installed');
                fetchInstalledMods();
              }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === 'installed'
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/30'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <FontAwesomeIcon icon={faCheck} />
              Installed Mods
              {installedFiles.length > 0 && (
                <span className={'ml-1 px-1.5 py-0.5 text-xs bg-emerald-500/30 text-emerald-300 rounded-full font-mono'}>
                  {installedFiles.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* BROWSE TAB */}
        {activeTab === 'browse' && (
          <>
            {/* Search & Filter Bar */}
            <div className={'bg-neutral-800/60 backdrop-blur-md border border-neutral-700/60 rounded-xl p-4 mb-6 shadow-xl'}>
              <div className={'grid grid-cols-1 md:grid-cols-12 gap-3'}>
                {/* Search Input */}
                <div className={'md:col-span-5 relative'}>
                  <FontAwesomeIcon
                    icon={faSearch}
                    className={'absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 text-sm'}
                  />
                  <input
                    type={'text'}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    placeholder={'Search mods (e.g. JEI, Sodium, Create)...'}
                    className={'w-full pl-10 pr-9 py-2.5 bg-neutral-900/80 border border-neutral-700/80 rounded-lg text-neutral-100 text-sm placeholder-neutral-500 focus:outline-none focus:border-cyan-500 transition-colors'}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setPage(1);
                      }}
                      className={'absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-200'}
                    >
                      <FontAwesomeIcon icon={faTimes} className={'text-sm'} />
                    </button>
                  )}
                </div>

                {/* Mod Loader Dropdown */}
                <div className={'md:col-span-2'}>
                  <select
                    value={selectedLoader}
                    onChange={(e) => {
                      setSelectedLoader(e.target.value);
                      setPage(1);
                    }}
                    className={'w-full py-2.5 px-3 bg-neutral-900/80 border border-neutral-700/80 rounded-lg text-neutral-200 text-sm focus:outline-none focus:border-cyan-500 transition-colors'}
                  >
                    {COMMON_LOADERS.map((ldr) => (
                      <option key={ldr.value} value={ldr.value}>
                        {ldr.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Minecraft Version Dropdown */}
                <div className={'md:col-span-2'}>
                  <select
                    value={selectedVersion}
                    onChange={(e) => {
                      setSelectedVersion(e.target.value);
                      setPage(1);
                    }}
                    className={'w-full py-2.5 px-3 bg-neutral-900/80 border border-neutral-700/80 rounded-lg text-neutral-200 text-sm focus:outline-none focus:border-cyan-500 transition-colors'}
                  >
                    {COMMON_VERSIONS.map((ver) => (
                      <option key={ver.value} value={ver.value}>
                        {ver.label}
                      </option>
                    ))}
                    {availableGameVersions
                      .filter((v) => !COMMON_VERSIONS.some((cv) => cv.value === v))
                      .map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Sort Dropdown */}
                <div className={'md:col-span-3'}>
                  <select
                    value={selectedSort}
                    onChange={(e) => {
                      setSelectedSort(e.target.value);
                      setPage(1);
                    }}
                    className={'w-full py-2.5 px-3 bg-neutral-900/80 border border-neutral-700/80 rounded-lg text-neutral-200 text-sm focus:outline-none focus:border-cyan-500 transition-colors'}
                  >
                    {SORT_OPTIONS.map((srt) => (
                      <option key={srt.value} value={srt.value}>
                        {srt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Provider Source Selector Bar (Modrinth, CurseForge) */}
            <div className={'flex flex-wrap items-center gap-2.5 mb-6 p-2.5 bg-neutral-800/40 border border-neutral-700/50 rounded-xl'}>
              <span className={'text-xs font-semibold uppercase tracking-wider text-neutral-400 px-2'}>
                Source:
              </span>

              {/* Modrinth */}
              <button
                type={'button'}
                onClick={() => {
                  if (selectedProvider !== 'modrinth') {
                    setSelectedProvider('modrinth');
                    setPage(1);
                  }
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer border ${
                  selectedProvider === 'modrinth'
                    ? 'bg-neutral-900/90 text-emerald-400 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                    : 'bg-neutral-900/80 text-neutral-400 border-neutral-700/70 hover:text-neutral-200 hover:border-neutral-600'
                }`}
              >
                <img src={MODRINTH_ICON} alt="Modrinth" className="w-4 h-4 shrink-0 object-contain" />
                <span>Modrinth</span>
              </button>

              {/* CurseForge */}
              <button
                type={'button'}
                onClick={() => {
                  if (selectedProvider !== 'curseforge') {
                    setSelectedProvider('curseforge');
                    setPage(1);
                  }
                }}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer border ${
                  selectedProvider === 'curseforge'
                    ? 'bg-neutral-900/90 text-[#F38148] border-[#D8602F] shadow-[0_0_12px_rgba(216,96,47,0.35)]'
                    : 'bg-neutral-900/80 text-neutral-400 border-neutral-700/70 hover:text-neutral-200 hover:border-neutral-600'
                }`}
              >
                <svg viewBox="0 0 320 320" className="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg">
                  <path style={{ fill: 'rgb(216,96,47)' }} strokeLinecap="round" d="M244.0133 123.4342C244.0133 123.4342 309.3466 113.2632 319.6666 83.6053L219.5733 83.6053 219.5733 60.079-0.3333 60.079 26.76 91.1053 26.76 122.8816C26.76 122.8816 95.12 119.3816 121.56 139.1579 157.7467 172.2632 80.8534 217.0131 80.8534 217.0131L67.6534 260.0789C88.28 240.6973 127.5733 215.6447 199.64 216.8421 172.2133 225.3947 144.64 238.75 123.1733 260.0789L268.84 260.0789 255.12 217.0131C255.12 217.0131 149.5467 155.5921 244.0133 123.4342"/>
                </svg>
                <span>CurseForge</span>
              </button>
            </div>

            {/* Error Message */}
            {catalogError && (
              <div className={'p-4 bg-red-900/40 border border-red-500/40 rounded-xl text-red-200 text-sm mb-6 flex items-center justify-between'}>
                <div className={'flex items-center gap-3'}>
                  <FontAwesomeIcon icon={faExclamationTriangle} className={'text-red-400'} />
                  <span>{catalogError}</span>
                </div>
                <button
                  onClick={fetchMods}
                  className={'px-3 py-1 bg-red-800/60 hover:bg-red-700/60 rounded text-xs font-medium text-white transition-colors'}
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading Spinner */}
            {loadingMods ? (
              <div className={'flex flex-col items-center justify-center py-24 text-neutral-400 gap-3'}>
                <FontAwesomeIcon icon={faSpinner} spin className={'text-3xl text-cyan-400'} />
                <span className={'text-sm font-medium'}>Searching verified mods on {selectedProvider === 'curseforge' ? 'CurseForge' : 'Modrinth'}...</span>
              </div>
            ) : mods.length === 0 ? (
              <div className={'text-center py-20 bg-neutral-800/40 border border-neutral-700/40 rounded-xl text-neutral-400'}>
                <FontAwesomeIcon icon={faCubes} className={'text-4xl text-neutral-600 mb-3'} />
                <p className={'text-base font-semibold text-neutral-300'}>No mods found</p>
                <p className={'text-sm text-neutral-500 mt-1'}>Try adjusting your search terms or loader filters.</p>
              </div>
            ) : (
              /* Mods Card Grid */
              <div className={'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5'}>
                {mods.map((mod) => {
                  const installedMatch = getInstalledFile(mod);
                  const isModInstalled = !!installedMatch;
                  const cardId = mod.project_id || mod.id || mod.slug;

                  return (
                    <div
                      key={cardId}
                      className={'bg-neutral-800/60 backdrop-blur-md border border-neutral-700/60 hover:border-cyan-500/50 rounded-xl p-5 flex flex-col justify-between transition-all duration-200 hover:shadow-xl hover:shadow-cyan-500/10'}
                    >
                      <div>
                        {/* Card Header: Icon & Titles */}
                        <div className={'flex items-start gap-4 mb-3'}>
                          {mod.icon_url ? (
                            <img
                              src={mod.icon_url}
                              alt={mod.title}
                              className={'w-14 h-14 rounded-xl object-cover bg-neutral-900/60 border border-neutral-700/60 shrink-0'}
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className={'w-14 h-14 rounded-xl bg-neutral-900/80 border border-neutral-700/60 flex items-center justify-center text-cyan-400 text-xl shrink-0'}>
                              <FontAwesomeIcon icon={faLayerGroup} />
                            </div>
                          )}

                          <div className={'flex-1 min-w-0'}>
                            <h3 className={'font-bold text-neutral-100 text-base leading-snug truncate'}>
                              {mod.title}
                            </h3>
                            <p className={'text-xs text-neutral-400 mt-0.5'}>by {mod.author}</p>
                            <div className={'flex items-center gap-3 text-xs text-neutral-400 mt-1'}>
                              <span>
                                <FontAwesomeIcon icon={faDownload} className={'text-cyan-400 mr-1 text-[10px]'} />
                                {formatNumber(mod.downloads || 0)}
                              </span>
                              <span>★ {formatNumber(mod.follows || 0)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        <p className={'text-xs text-neutral-300 line-clamp-2 mb-3 leading-relaxed'}>
                          {mod.description}
                        </p>

                        {/* Categories / Tags */}
                        {Array.isArray(mod.categories) && mod.categories.length > 0 && (
                          <div className={'flex flex-wrap gap-1.5 mb-4'}>
                            {mod.categories.slice(0, 4).map((cat) => (
                              <span
                                key={cat}
                                className={'px-2 py-0.5 bg-neutral-900/80 border border-neutral-700/60 text-neutral-300 text-[11px] rounded-md font-medium capitalize'}
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Card Footer Actions */}
                      <div className={'pt-3 border-t border-neutral-700/40 flex items-center justify-between gap-2'}>
                        {isModInstalled ? (
                          <div className={'flex items-center justify-between w-full'}>
                            <span className={'inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-semibold rounded-lg'}>
                              <FontAwesomeIcon icon={faCheck} />
                              Installed
                            </span>
                            <div className={'flex items-center gap-2'}>
                              <button
                                onClick={() => openInstallModal(mod)}
                                className={'px-3 py-1.5 bg-cyan-600/30 hover:bg-cyan-600/50 border border-cyan-500/40 text-cyan-200 text-xs font-medium rounded-lg transition-colors'}
                              >
                                Versions
                              </button>
                              {installedMatch && (
                                <button
                                  onClick={() => handleUninstallFile(installedMatch.name)}
                                  disabled={uninstallingFile === installedMatch.name}
                                  className={'p-2 bg-red-600/30 hover:bg-red-600/50 border border-red-500/40 text-red-300 text-xs rounded-lg transition-colors'}
                                  title={`Delete ${installedMatch.name}`}
                                >
                                  <FontAwesomeIcon icon={uninstallingFile === installedMatch.name ? faSpinner : faTrash} spin={uninstallingFile === installedMatch.name} />
                                </button>
                              )}
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => openInstallModal(mod)}
                            className={'w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2'}
                          >
                            <FontAwesomeIcon icon={faDownload} />
                            Install Mod
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalHits > pageSize && (
              <div className={'flex items-center justify-between mt-8 pt-4 border-t border-neutral-700/60 text-sm text-neutral-400'}>
                <span>
                  Showing {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, totalHits)} of {totalHits} mods
                </span>
                <div className={'flex items-center gap-2'}>
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className={'px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-xs font-medium text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-700'}
                  >
                    Previous
                  </button>
                  <span className={'px-3 py-1 text-xs font-mono text-neutral-300'}>Page {page}</span>
                  <button
                    disabled={page * pageSize >= totalHits}
                    onClick={() => setPage((p) => p + 1)}
                    className={'px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-xs font-medium text-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-700'}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* INSTALLED TAB */}
        {activeTab === 'installed' && (
          <div>
            <div className={'flex items-center justify-between mb-4'}>
              <div>
                <h3 className={'text-lg font-bold text-neutral-100'}>Installed Mods</h3>
                <p className={'text-xs text-neutral-400'}>Showing all .jar and .zip mod files in /mods</p>
              </div>
              <button
                onClick={fetchInstalledMods}
                disabled={loadingInstalled}
                className={'px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg text-xs font-medium text-neutral-300 transition-colors flex items-center gap-1.5'}
              >
                <FontAwesomeIcon icon={faSpinner} spin={loadingInstalled} className={loadingInstalled ? 'text-cyan-400' : ''} />
                Refresh
              </button>
            </div>

            {loadingInstalled ? (
              <div className={'flex flex-col items-center justify-center py-20 text-neutral-400 gap-3'}>
                <FontAwesomeIcon icon={faSpinner} spin className={'text-3xl text-cyan-400'} />
                <span className={'text-sm'}>Scanning /mods directory...</span>
              </div>
            ) : installedFiles.length === 0 ? (
              <div className={'text-center py-20 bg-neutral-800/40 border border-neutral-700/40 rounded-xl text-neutral-400'}>
                <FontAwesomeIcon icon={faFolderOpen} className={'text-4xl text-neutral-600 mb-3'} />
                <p className={'text-base font-semibold text-neutral-300'}>No mods currently installed in /mods</p>
                <p className={'text-sm text-neutral-500 mt-1'}>
                  Browse the catalog and install mods directly to your server.
                </p>
                <button
                  onClick={() => setActiveTab('browse')}
                  className={'mt-4 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg transition-colors'}
                >
                  Browse Mods
                </button>
              </div>
            ) : (
              <div className={'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
                {installedFiles.map((file) => (
                  <div
                    key={file.name}
                    className={'bg-neutral-800/60 backdrop-blur-md border border-neutral-700/60 rounded-xl p-4 flex items-center justify-between gap-3 shadow-sm hover:border-neutral-600 transition-colors'}
                  >
                    <div className={'flex items-center gap-3 min-w-0'}>
                      <div className={'w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0'}>
                        <FontAwesomeIcon icon={faCubes} />
                      </div>
                      <div className={'min-w-0'}>
                        <p className={'text-xs font-bold text-neutral-100 truncate'} title={file.name}>
                          {file.name}
                        </p>
                        <p className={'text-[11px] text-neutral-400'}>
                          {formatSize(file.size)} {file.modifiedAt ? `• ${formatTimeAgo(file.modifiedAt)}` : ''}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleUninstallFile(file.name)}
                      disabled={uninstallingFile === file.name}
                      className={'p-2 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 text-red-300 text-xs rounded-lg transition-colors shrink-0'}
                      title={`Delete ${file.name}`}
                    >
                      <FontAwesomeIcon icon={uninstallingFile === file.name ? faSpinner : faTrash} spin={uninstallingFile === file.name} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* VERSION SELECTOR MODAL */}
        {installModalOpen && activeMod && (
          <div className={'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm'}>
            <div className={'bg-neutral-900 border border-neutral-700/80 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl overflow-hidden'}>
              {/* Modal Header */}
              <div className={'flex items-center justify-between px-4 py-3 border-b border-neutral-800 shrink-0'}>
                <div className={'flex items-center gap-2.5 min-w-0'}>
                  {activeMod.icon_url ? (
                    <img src={activeMod.icon_url} alt={activeMod.title} className={'w-8 h-8 rounded-lg object-cover shrink-0'} />
                  ) : (
                    <div className={'w-8 h-8 rounded-lg bg-neutral-800 flex items-center justify-center text-cyan-400 shrink-0'}>
                      <FontAwesomeIcon icon={faCubes} className={'text-sm'} />
                    </div>
                  )}
                  <div className={'min-w-0'}>
                    <h3 className={'text-sm font-bold text-neutral-100 truncate'}>{activeMod.title}</h3>
                    <p className={'text-[11px] text-neutral-400'}>Select Version to Install</p>
                  </div>
                </div>

                <button
                  onClick={() => setInstallModalOpen(false)}
                  className={'p-1.5 text-neutral-400 hover:text-neutral-200 transition-colors rounded-lg'}
                >
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>

              {/* Toast / Notice */}
              {installNotice && (
                <div className={`px-4 py-2 text-xs flex items-center justify-between ${
                  installNotice.success
                    ? 'bg-emerald-500/20 text-emerald-300 border-b border-emerald-500/30'
                    : 'bg-red-500/20 text-red-300 border-b border-red-500/30'
                }`}>
                  <span>{installNotice.message}</span>
                  <button onClick={() => setInstallNotice(null)} className={'text-xs opacity-70 hover:opacity-100'}>
                    ✕
                  </button>
                </div>
              )}

              {/* Filter Row inside Modal */}
              <div className={'p-3 bg-neutral-950/60 border-b border-neutral-800/80 grid grid-cols-3 gap-2 shrink-0'}>
                {/* Loader Filter */}
                <select
                  value={modalLoader}
                  onChange={(e) => setModalLoader(e.target.value)}
                  className={'py-1.5 px-2 bg-neutral-800 border border-neutral-700/80 rounded-lg text-neutral-200 text-xs focus:outline-none focus:border-cyan-500'}
                >
                  <option value={'all'}>All Loaders</option>
                  {availableModalLoaders.map((l) => (
                    <option key={l} value={l}>
                      {l.toUpperCase()}
                    </option>
                  ))}
                </select>

                {/* MC Version Filter */}
                <select
                  value={modalGameVersion}
                  onChange={(e) => setModalGameVersion(e.target.value)}
                  className={'py-1.5 px-2 bg-neutral-800 border border-neutral-700/80 rounded-lg text-neutral-200 text-xs focus:outline-none focus:border-cyan-500'}
                >
                  <option value={'all'}>All Versions</option>
                  {availableModalVersions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>

                {/* Release Type Filter */}
                <select
                  value={modalType}
                  onChange={(e) => setModalType(e.target.value as any)}
                  className={'py-1.5 px-2 bg-neutral-800 border border-neutral-700/80 rounded-lg text-neutral-200 text-xs focus:outline-none focus:border-cyan-500'}
                >
                  <option value={'all'}>All Channels</option>
                  <option value={'release'}>Release Only</option>
                  <option value={'beta'}>Beta</option>
                  <option value={'alpha'}>Alpha</option>
                </select>
              </div>

              {/* Modal Body: Versions List */}
              <div className={'p-4 space-y-2.5 overflow-y-auto max-h-[55vh]'}>
                {loadingVersions ? (
                  <div className={'py-12 flex flex-col items-center justify-center text-neutral-400 gap-2'}>
                    <FontAwesomeIcon icon={faSpinner} spin className={'text-2xl text-cyan-400'} />
                    <span className={'text-xs'}>Fetching compatible versions...</span>
                  </div>
                ) : versionError ? (
                  <div className={'p-3 bg-red-900/30 border border-red-500/40 rounded-xl text-red-200 text-xs'}>
                    {versionError}
                  </div>
                ) : filteredVersions.length === 0 ? (
                  <p className={'text-center text-xs text-neutral-400 py-10'}>
                    No versions match the selected filters.
                  </p>
                ) : (
                  filteredVersions.map((ver) => {
                    const primaryFile = ver.files?.find((f) => f.primary) || ver.files?.[0];
                    const isInstalled = installedVersions[ver.id];
                    const isInstalling = installingVersionId === ver.id;

                    const typeBadgeColor =
                      ver.version_type === 'release'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                        : ver.version_type === 'beta'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        : 'bg-rose-500/20 text-rose-300 border-rose-500/30';

                    return (
                      <div
                        key={ver.id}
                        className={'bg-neutral-800/60 border border-neutral-700/70 hover:border-neutral-600 rounded-xl p-3 flex items-center justify-between gap-3 transition-colors'}
                      >
                        <div className={'min-w-0 flex-1'}>
                          <div className={'flex items-center gap-2 flex-wrap'}>
                            <span className={'text-xs font-bold text-neutral-100 truncate'}>
                              {ver.version_number || ver.name}
                            </span>
                            <span className={`px-1.5 py-0.5 text-[10px] rounded border uppercase font-mono font-semibold ${typeBadgeColor}`}>
                              {ver.version_type}
                            </span>
                          </div>

                          <div className={'flex items-center gap-2 text-[11px] text-neutral-400 mt-1 flex-wrap'}>
                            <span>
                              MC: {Array.isArray(ver.game_versions) ? ver.game_versions.slice(0, 3).join(', ') : 'All'}
                              {ver.game_versions && ver.game_versions.length > 3 ? '...' : ''}
                            </span>
                            <span>•</span>
                            <span>{Array.isArray(ver.loaders) ? ver.loaders.join(', ').toUpperCase() : 'MOD'}</span>
                            {primaryFile && (
                              <>
                                <span>•</span>
                                <span>{formatSize(primaryFile.size)}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Install Button */}
                        <button
                          onClick={() => handleInstallVersion(ver)}
                          disabled={isInstalling || !primaryFile}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                            isInstalled
                              ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                              : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md shadow-cyan-500/20'
                          }`}
                        >
                          {isInstalling ? (
                            <>
                              <FontAwesomeIcon icon={faSpinner} spin className={'text-xs'} />
                              Installing...
                            </>
                          ) : isInstalled ? (
                            <>
                              <FontAwesomeIcon icon={faCheck} />
                              Installed
                            </>
                          ) : (
                            <>
                              <FontAwesomeIcon icon={faDownload} />
                              Install
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer */}
              <div className={'px-4 py-3 bg-neutral-950/60 border-t border-neutral-800 flex items-center justify-end shrink-0'}>
                <button
                  onClick={() => setInstallModalOpen(false)}
                  className={'px-4 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium rounded-lg transition-colors'}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ServerContentBlock>
  );
}
