'use client'

import { LogoProps } from '@/types/logo.interface'
import clsx from 'clsx'

/**
 * Web app logo
 * @param {Object} props - component properties
 * @param {number} props.size - size of the logo
 * @returns {JSX.Element} styled logo component
 */
const Logo = ({ size = 48, animate = false }: LogoProps): JSX.Element => {
  const scale = 0.035
  const bigScale = scale * 5
  const duration = '2s'

  return (
    <div>
      <svg
        fill='#000000'
        width={size}
        height={size}
        viewBox='0 0 1.92 1.92'
        id='icon'
        version='1.1'
        xmlns='http://www.w3.org/2000/svg'
      >
        <defs id='defs4'>
          <defs id='defs1'>
            <style id='style1'>
              {`
                  .line1 {
                    stroke-dasharray: ${size * scale};
                    stroke-dashoffset: ${size * scale};
                    animation: draw1 ${duration} linear infinite;
                  }
                  .line2 {
                    stroke-dasharray: ${size * scale};
                    stroke-dashoffset: ${size * scale};
                    animation: draw2 ${duration} linear infinite;
                  }
                  .line3 {
                    stroke-dasharray: ${size * scale};
                    stroke-dashoffset: ${size * scale};
                    animation: draw3 ${duration} linear infinite;
                  }
                  .bubble {
                    // stroke-dasharray: ${size * bigScale};
                    // stroke-dashoffset: ${size * bigScale};
                    opacity: 1
                    // animation: pulse
                  }

                  @keyframes draw1 {
                    0% {
                      stroke-dashoffset: ${size * scale};
                    }
                    20% {
                      stroke-dashoffset: ${size * scale};
                    }
                    40% {
                      stroke-dashoffset: 0;
                    }
                    60% {
                      stroke-dashoffset: 0;
                    }
                    80% {
                      stroke-dashoffset: 0;
                    }
                    100% {
                      stroke-dashoffset: 0;
                    }
                  }

                  @keyframes draw2 {
                    0% {
                      stroke-dashoffset: ${size * scale};
                    }
                    20% {
                      stroke-dashoffset: ${size * scale};
                    }
                    40% {
                      stroke-dashoffset: ${size * scale};
                    }
                    60% {
                      stroke-dashoffset: 0;
                    }
                    100% {
                      stroke-dashoffset: 0;
                    }
                  }

                  @keyframes draw3 {
                    0% {
                      stroke-dashoffset: ${size * scale};
                    }
                    20% {
                      stroke-dashoffset: ${size * scale};
                    }
                    40% {
                      stroke-dashoffset: ${size * scale};
                    }
                    60% {
                      stroke-dashoffset: ${size * scale};
                    }
                    80% {
                      stroke-dashoffset: 0;
                    }
                    100% {
                      stroke-dashoffset: 0;
                    }
                  }
                `}
            </style>
          </defs>
        </defs>

        <path
          d='M 1.04679,1.66 0.96,1.61 1.16,1.26 h 0.3 a 0.09983,0.09983 0 0 0 0.1,-0.1 v -0.7 a 0.09983,0.09983 0 0 0 -0.1,-0.1 h -1 a 0.09983,0.09983 0 0 0 -0.1,0.1 v 0.7 a 0.09983,0.09983 0 0 0 0.1,0.1 h 0.45 v 0.1 H 0.46 a 0.199965,0.199965 0 0 1 -0.2,-0.2 v -0.7 a 0.19994,0.19994 0 0 1 0.2,-0.2 h 1 a 0.19994,0.19994 0 0 1 0.2,0.2 v 0.7 a 0.199965,0.199965 0 0 1 -0.2,0.2 H 1.21823 Z'
          id='path4'
          fill='#20b2aa'
          className={clsx(animate && 'bubble animate-pulse')}
        />

        <path
          d='m 0.47252977,0.58180783 c 0.47396519,-0.17453078 0.53776463,0.16859801 0.97435283,0'
          id='path5'
          stroke='#9370db'
          strokeWidth={0.08}
          fill='transparent'
          className={clsx(animate && 'line1')}
        />
        <path
          d='m 0.47252974,0.78859495 c 0.47396519,-0.17453078 0.53776456,0.16859799 0.97435286,0'
          id='path7'
          stroke='#faad14'
          strokeWidth={0.08}
          fill='transparent'
          className={clsx(animate && 'line2')}
        />
        <path
          d='m 0.47252977,0.99888697 c 0.47396519,-0.17453082 0.53776463,0.16859793 0.97435283,0'
          id='path6'
          stroke='#33d205'
          strokeWidth={0.08}
          fill='transparent'
          className={clsx(animate && 'line3')}
        />
      </svg>
    </div>
  )
}

export default Logo
